import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { AccessTokenPayload, AuthUser } from '../../common/auth/auth-user';
import { AppConfig } from '../../config/app.config';
import { DatabaseService } from '../../database/database.service';
import { LoginDto, RegisterDto } from './auth.dto';

const BCRYPT_ROUNDS = 10;

/**
 * A valid bcrypt hash of a random string. When a login uses an unknown email
 * we still run bcrypt.compare against it, so the response time does not reveal
 * whether the email is registered.
 */
const DUMMY_HASH = '$2b$10$CwTycUXWue0Thq9StjUM0uJ8.MBvYZ6o5b5Yp9d1x8Y5uZ5aY5b6e';

export interface AuthTokens {
  accessToken: string;
  /** Opaque token "<sessionId>.<secret>"; exchange it at /auth/refresh. */
  refreshToken: string;
  /** Access-token lifetime, e.g. "15m". */
  accessTokenExpiresIn: string;
  refreshTokenExpiresAt: string;
}

/**
 * Authentication with short-lived JWT access tokens + rotating refresh tokens.
 *
 *  - Login creates a `sessions` row. The access token (JWT, ~15 min) carries the
 *    session id; the refresh token is random and only its SHA-256 is stored.
 *  - /auth/refresh rotates the refresh token and slides the session expiry
 *    forward, so an active user stays logged in indefinitely while an idle one
 *    expires after REFRESH_TTL_DAYS.
 *  - Logout revokes the session. Because the guard checks the session on every
 *    request, the logged-out access token stops working at once.
 *  - Presenting an old (already rotated) refresh token revokes the session:
 *    that only happens if the token was stolen and replayed.
 */
@Injectable()
export class AuthService {
  private readonly cfg: AppConfig['auth'];

  constructor(
    private readonly db: DatabaseService,
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    this.cfg = config.getOrThrow<AppConfig>('app').auth;
  }

  async register(dto: RegisterDto, userAgent?: string) {
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = await this.db
      .one<AuthUser>(
        `INSERT INTO users (name, email, password_hash, role)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name, email, role`,
        [dto.name, dto.email, passwordHash, dto.role],
      )
      .catch((err) => {
        if (err.code === '23505') throw new ConflictException('An account with this email already exists');
        throw err;
      });
    const tokens = await this.createSession(user!.id, userAgent);
    return { user: this.publicUser(user!), ...tokens };
  }

  async login(dto: LoginDto, userAgent?: string) {
    const user = await this.db.one<AuthUser & { password_hash: string }>(
      `SELECT id, name, email, role, password_hash FROM users WHERE lower(email) = $1`,
      [dto.email],
    );
    // Always run bcrypt so "unknown email" and "wrong password" look identical
    // (same message, similar timing).
    const ok = await bcrypt.compare(dto.password, user?.password_hash ?? DUMMY_HASH);
    if (!user || !ok) throw new UnauthorizedException('Invalid email or password');

    const tokens = await this.createSession(user.id, userAgent);
    return { user: this.publicUser(user), ...tokens };
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    const [sessionId, secret] = refreshToken.split('.');
    if (!sessionId || !secret || !isUuid(sessionId)) throw new UnauthorizedException('Invalid refresh token');

    return this.db.transaction(async (tx) => {
      // Lock the session so two parallel refreshes cannot both succeed.
      const session = await tx.one<{ user_id: number; refresh_token_hash: string; active: boolean }>(
        `SELECT user_id, refresh_token_hash,
                (revoked_at IS NULL AND expires_at > now()) AS active
           FROM sessions WHERE id = $1 FOR UPDATE`,
        [sessionId],
      );
      if (!session || !session.active) throw new UnauthorizedException('Session expired, please log in again');

      if (!safeEqual(session.refresh_token_hash, sha256(secret))) {
        // Reuse of a rotated token => likely theft. Kill the session.
        await tx.query(`UPDATE sessions SET revoked_at = now() WHERE id = $1`, [sessionId]);
        throw new UnauthorizedException('Refresh token was already used; session revoked');
      }

      const newSecret = randomBytes(32).toString('base64url');
      const expiresAt = this.refreshExpiry();
      await tx.query(
        `UPDATE sessions
            SET refresh_token_hash = $2, expires_at = $3, last_refreshed_at = now()
          WHERE id = $1`,
        [sessionId, sha256(newSecret), expiresAt],
      );
      return this.tokens(session.user_id, sessionId, newSecret, expiresAt);
    });
  }

  async logout(sessionId: string): Promise<void> {
    await this.db.query(`UPDATE sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL`, [sessionId]);
  }

  async profile(userId: number) {
    const user = await this.db.one(
      `SELECT u.id, u.name, u.email, u.role, u.created_at AS "createdAt",
              (SELECT count(*) FROM project_members m
                 JOIN projects p ON p.id = m.project_id AND p.deleted_at IS NULL
                WHERE m.user_id = u.id)::int AS "projectCount",
              (SELECT count(*) FROM project_invitations i
                WHERE i.user_id = u.id AND i.read_at IS NULL)::int AS "unreadNotifications"
         FROM users u WHERE u.id = $1`,
      [userId],
    );
    if (!user) throw new UnauthorizedException();
    return user;
  }

  private async createSession(userId: number, userAgent?: string): Promise<AuthTokens> {
    const sessionId = randomUUID();
    const secret = randomBytes(32).toString('base64url');
    const expiresAt = this.refreshExpiry();
    await this.db.query(
      `INSERT INTO sessions (id, user_id, refresh_token_hash, expires_at, user_agent)
       VALUES ($1, $2, $3, $4, $5)`,
      [sessionId, userId, sha256(secret), expiresAt, userAgent?.slice(0, 300) ?? null],
    );
    return this.tokens(userId, sessionId, secret, expiresAt);
  }

  private async tokens(userId: number, sessionId: string, secret: string, expiresAt: Date): Promise<AuthTokens> {
    const payload: AccessTokenPayload = { sub: userId, sid: sessionId };
    return {
      accessToken: await this.jwt.signAsync(payload),
      refreshToken: `${sessionId}.${secret}`,
      accessTokenExpiresIn: this.cfg.accessTokenTtl,
      refreshTokenExpiresAt: expiresAt.toISOString(),
    };
  }

  private refreshExpiry(): Date {
    return new Date(Date.now() + this.cfg.refreshTokenTtlDays * 24 * 60 * 60 * 1000);
  }

  /** Never return password hashes. */
  private publicUser(user: AuthUser) {
    return { id: user.id, name: user.name, email: user.email, role: user.role };
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
