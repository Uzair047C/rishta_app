import { Controller, Post, Body, Get, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';
import { CurrentUser } from './current-user.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('firebase')
  @Public()
  async firebaseLogin(@Body() { idToken }: { idToken: string }) {
    return this.authService.firebaseLogin(idToken);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('refresh')
  @Public()
  async refresh(@Body() { refreshToken }: { refreshToken: string }) {
    return this.authService.refreshAccessToken(refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@CurrentUser() userId: string, @Body() { refreshToken }: { refreshToken?: string }) {
    return this.authService.logout(userId, refreshToken);
  }

  @Get('me')
  async getProfile(@CurrentUser() userId: string) {
    const user = await this.authService.validateUser(userId);
    if (!user) {
      return { userId: null };
    }
    return {
      userId: user.id,
      email: user.email,
      emailVerified: user.email_verified,
      authProvider: user.auth_provider,
      firebaseUid: user.firebase_uid,
      status: user.status,
      createdAt: user.created_at,
    };
  }

  @Get('stream-token')
  async getStreamToken(@CurrentUser() userId: string) {
    return this.authService.getStreamToken(userId);
  }
}