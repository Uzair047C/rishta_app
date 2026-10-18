import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UserRow } from '../db/types';
import { Request, Response } from 'express';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async googleLogin(req: Request, res: Response): Promise<void> {
    // This method is a placeholder; the actual Google OAuth initiation is handled by Passport
    // in the AuthModule. We leave it empty to avoid interfering with the route handler.
    return;
  }

  async googleCallback(req: Request, res: Response): Promise<void> {
    const user = (req as any).user as UserRow;
    if (!user) {
      throw new UnauthorizedException('User not found from Google callback');
    }

    // Check if user has completed onboarding
    let isOnboarded = false;
    try {
      await this.usersService.requireOnboarded(user.id);
      isOnboarded = true;
    } catch (err) {
      // If requireOnboarded throws ForbiddenException, user is not onboarded
      if (err instanceof Error && err.message === 'profile_incomplete') {
        isOnboarded = false;
      } else {
        throw err;
      }
    }

    const payload = { userId: user.id };
    const jwtSecret = this.configService.get<string>('JWT_SECRET');
    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';

    if (isOnboarded) {
      const token = this.jwtService.sign(payload, {
        secret: jwtSecret,
        expiresIn: '7d',
      });
      // Set HTTP-only cookie for auth token
      res.cookie('token', token, {
        httpOnly: true,
        secure: this.configService.get<string>('NODE_ENV') === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });
      // Redirect to frontend home page
      res.redirect(`${frontendUrl}/`);
    } else {
      // Create a temporary token for onboarding completion
      const tempToken = this.jwtService.sign(
        { ...payload, temp: true },
        {
          secret: jwtSecret,
          expiresIn: '1h', // Temporary token valid for 1 hour
        },
      );
      // Set HTTP-only cookie for temporary token
      res.cookie('temp_token', tempToken, {
        httpOnly: true,
        secure: this.configService.get<string>('NODE_ENV') === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 1000, // 1 hour
      });
      // Redirect to frontend onboarding page
      res.redirect(`${frontendUrl}/onboard`);
    }
  }
}