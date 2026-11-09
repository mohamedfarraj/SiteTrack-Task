import { AppRole } from '../enums';

/**
 * The authenticated caller, attached to `request.user` by JwtAuthGuard.
 * It is re-read from the database on every request, so a role change or a
 * logout is picked up on the very next call.
 */
export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: AppRole;
  sessionId: string;
}

/** Claims inside an access token. */
export interface AccessTokenPayload {
  /** User id. */
  sub: number;
  /** Session id; the session must still be active for the token to work. */
  sid: string;
}
