import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';
import { CurrentUser } from './current-user.decorator';
import { GoogleLoginDto } from './dto/google-login.dto';
import { LogoutDto, RefreshDto } from './dto/auth.dto';

// JwtAuthGuard is a global APP_GUARD; @Public opts routes out.
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // /auth/* 10/min/IP
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('google')
  @Public()
  async googleLogin(@Body() dto: GoogleLoginDto) {
    return this.authService.googleLogin(dto.idToken);
  }

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
  async refresh(@Body() dto: RefreshDto) {
    return this.authService.refreshAccessToken(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@CurrentUser() userId: string, @Body() dto: LogoutDto) {
    return this.authService.logout(userId, dto.refreshToken);
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
