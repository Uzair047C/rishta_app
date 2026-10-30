import { Controller, Post, Body, Get, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';
import { CurrentUser } from './current-user.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // /auth/* 10/min/IP
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('firebase')
  @Public()
  async firebaseLogin(@Body() { idToken }: { idToken: string }) {
    return this.authService.firebaseLogin(idToken);
  }

  // refresh 30/min/IP
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
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
    try {
      return await this.authService.getProfileSummary(userId);
    } catch {
      return { userId: null };
    }
  }

  @Get('stream-token')
  async getStreamToken(@CurrentUser() userId: string) {
    return this.authService.getStreamToken(userId);
  }
}