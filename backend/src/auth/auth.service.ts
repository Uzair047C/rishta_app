import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UserRow } from '../db/types';
import { OAuth2Client } from 'google-auth-library';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async validateGoogleIdToken(idToken: string): Promise<{ email: string; googleId: string; emailVerified: boolean; name?: { givenName?: string; familyName?: string } }> {
    try {
      const client = new OAuth2Client();
      const audience = this.configService.get<string[]>('GOOGLE_CLIENT_IDS') ?? [];
      const ticket = await client.verifyIdToken({
        idToken,
        audience: audience.filter(Boolean),
      });
      const payload = ticket.getPayload();

      if (!payload) {
        throw new UnauthorizedException('Invalid ID token');
      }

      // Check issuer
      const allowedIssuers = ['accounts.google.com', 'https://accounts.google.com'];
      if (!allowedIssuers.includes(payload.iss)) {
        throw new UnauthorizedException('Invalid token issuer');
      }

      // Check email verified
      if (!payload.email_verified) {
        throw new UnauthorizedException('Email not verified with Google');
      }

      return {
        email: payload.email ?? '',
        googleId: payload.sub ?? '',
        emailVerified: payload.email_verified ?? false,
        name: {
          givenName: payload.given_name ?? undefined,
          familyName: payload.family_name ?? undefined,
        }
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid Google ID token');
    }
  }

  async googleLogin(idToken: string): Promise<{ accessToken: string; user: UserRow; profileComplete: boolean }> {
    const googlePayload = await this.validateGoogleIdToken(idToken);

    // Find or create user by Google ID
    const user = await this.usersService.findOrCreateByGoogleId(
      googlePayload.googleId,
      googlePayload.email,
      googlePayload.name?.givenName,
      googlePayload.name?.familyName
    );

    // Check if user has completed onboarding (has a profile)
    let profileComplete = false;
    try {
      await this.usersService.requireOnboarded(user.id);
      profileComplete = true;
    } catch (err) {
      // If requireOnboarded throws ForbiddenException, user is not onboarded
      if (err instanceof Error && err.message === 'profile_incomplete') {
        profileComplete = false;
      } else {
        throw err;
      }
    }

    // Generate JWT
    const payload = { userId: user.id };
    const jwtSecret = this.configService.get<string>('JWT_SECRET');
    if (!jwtSecret) {
      throw new Error('JWT_SECRET is not configured');
    }
    const accessToken = this.jwtService.sign(payload, {
      secret: jwtSecret,
      expiresIn: '15m', // Short expiry as requested
    });

    return {
      accessToken,
      user,
      profileComplete,
    };
  }

  async logout(): Promise<{ success: boolean }> {
    // In a more sophisticated implementation, we would invalidate the token
    // For now, we rely on short expiry and client-side removal
    return { success: true };
  }

  async validateUser(userId: string): Promise<UserRow | null> {
    return this.usersService.findOne(userId);
  }
}