import { Controller, Post, Body, Get, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';
import { Request } from 'express';
import { CurrentUser } from './current-user.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('google')
  @Public()
  async googleLogin(@Body() { idToken }: { idToken: string }) {
    return this.authService.googleLogin(idToken);
  }

  @Post('logout')
  async logout() {
    return this.authService.logout();
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getProfile(@CurrentUser() userId: string) {
    // This will be handled by the service, but we need to return user data
    // For now, we'll return the userId - the actual implementation would fetch user data
    return { userId };
  }
}