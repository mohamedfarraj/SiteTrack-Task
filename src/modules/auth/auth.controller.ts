import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, Public } from '../../common/auth/decorators';
import { LoginDto, RefreshDto, RegisterDto } from './auth.dto';
import { AuthService } from './auth.service';

/** Stricter rate limit for credential endpoints (brute-force protection). */
const AUTH_THROTTLE = { default: { limit: Number(process.env.THROTTLE_AUTH_LIMIT ?? 20), ttl: 60_000 } };

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('register')
  @ApiOperation({ summary: 'Register (screen 2). Returns the user and a fresh session.' })
  register(@Body() dto: RegisterDto, @Headers('user-agent') ua?: string) {
    return this.auth.register(dto, ua);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Log in (screen 1)',
    description: 'A failed login always answers 401 "Invalid email or password", whether or not the email exists.',
  })
  login(@Body() dto: LoginDto, @Headers('user-agent') ua?: string) {
    return this.auth.login(dto, ua);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Exchange a refresh token for a new access + refresh token pair',
    description: 'Call this when an access token expires (401). Refresh tokens are single-use (rotated).',
  })
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @ApiBearerAuth()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log out: the current session (access and refresh token) stops working immediately' })
  async logout(@CurrentUser() user: AuthUser) {
    await this.auth.logout(user.sessionId);
    return { loggedOut: true };
  }

  @ApiBearerAuth()
  @Get('me')
  @ApiOperation({ summary: 'Own profile, with project count and unread notification count' })
  me(@CurrentUser() user: AuthUser) {
    return this.auth.profile(user.id);
  }
}
