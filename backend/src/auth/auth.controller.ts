import { Controller, Get, Req, Res } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Request, Response } from 'express';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('google')
  async googleLogin(@Req() req: Request, @Res() res: Response) {
    // This will be handled by Passport
    await this.authService.googleLogin(req, res);
  }

  @Get('google/callback')
  async googleCallback(@Req() req: Request, @Res() res: Response) {
    await this.authService.googleCallback(req, res);
  }
}