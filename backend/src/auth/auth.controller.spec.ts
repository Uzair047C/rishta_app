import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Db } from '../db/db';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: jest.Mocked<AuthService>;

  const mockUser = {
    id: 'test-user-id',
    email: 'test@example.com',
    email_verified: true,
    auth_provider: 'firebase',
    firebase_uid: 'firebase-uid-123',
    status: 'active',
    created_at: new Date(),
    phone: null,
    phone_verified: true,
    gender: null,
    dob: null,
    location: null,
    lat: null,
    lng: null,
    device_id: null,
    provider_subject: null,
    is_admin: false,
  } as any;

  beforeEach(async () => {
    const mockAuthService = {
      firebaseLogin: jest.fn(),
      refreshAccessToken: jest.fn(),
      logout: jest.fn(),
      validateUser: jest.fn(),
      getStreamToken: jest.fn(),
    };

    const mockReflector = {
      getAllAndOverride: jest.fn(),
    };
    const mockJwtService = { verify: jest.fn() };
    const mockConfigService = { get: jest.fn().mockReturnValue('test-secret') };
    const mockDb = { oneOrNone: jest.fn().mockResolvedValue({ id: 'test-user-id', status: 'active', is_admin: false }) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: Reflector, useValue: mockReflector },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: Db, useValue: mockDb },
        JwtAuthGuard,
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('firebaseLogin', () => {
    it('should return tokens and user on valid Firebase ID token', async () => {
      const expected = {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        user: mockUser,
        profileComplete: false,
      };
      authService.firebaseLogin.mockResolvedValue(expected);

      const result = await controller.firebaseLogin({ idToken: 'valid-firebase-id-token' });

      expect(result).toEqual(expected);
      expect(authService.firebaseLogin).toHaveBeenCalledWith('valid-firebase-id-token');
    });

    it('should propagate UnauthorizedException from service', async () => {
      authService.firebaseLogin.mockRejectedValue(new UnauthorizedException('Invalid Firebase ID token'));

      await expect(controller.firebaseLogin({ idToken: 'invalid-token' })).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refresh', () => {
    it('should return new token pair on valid refresh token', async () => {
      const expected = { accessToken: 'new-access-token', refreshToken: 'new-refresh-token' };
      authService.refreshAccessToken.mockResolvedValue(expected);

      const result = await controller.refresh({ refreshToken: 'valid-refresh-token' });

      expect(result).toEqual(expected);
      expect(authService.refreshAccessToken).toHaveBeenCalledWith('valid-refresh-token');
    });

    it('should propagate UnauthorizedException for invalid refresh token', async () => {
      authService.refreshAccessToken.mockRejectedValue(new UnauthorizedException('Invalid or expired refresh token'));

      await expect(controller.refresh({ refreshToken: 'invalid-token' })).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('should return success and call logout with userId and refreshToken', async () => {
      authService.logout.mockResolvedValue({ success: true });

      const result = await controller.logout('test-user-id', { refreshToken: 'some-refresh-token' });

      expect(result).toEqual({ success: true });
      expect(authService.logout).toHaveBeenCalledWith('test-user-id', 'some-refresh-token');
    });

    it('should call logout without refreshToken when not provided', async () => {
      authService.logout.mockResolvedValue({ success: true });

      const result = await controller.logout('test-user-id', {});

      expect(result).toEqual({ success: true });
      expect(authService.logout).toHaveBeenCalledWith('test-user-id', undefined);
    });
  });

  describe('getProfile', () => {
    it('should return user profile data', async () => {
      authService.validateUser.mockResolvedValue(mockUser);

      const result = await controller.getProfile('test-user-id');

      expect(result).toEqual({
        userId: mockUser.id,
        email: mockUser.email,
        emailVerified: mockUser.email_verified,
        authProvider: mockUser.auth_provider,
        firebaseUid: mockUser.firebase_uid,
        status: mockUser.status,
        createdAt: mockUser.created_at,
      });
    });

    it('should return null userId when user not found', async () => {
      authService.validateUser.mockResolvedValue(null);

      const result = await controller.getProfile('non-existent-id');

      expect(result).toEqual({ userId: null });
    });
  });

  describe('getStreamToken', () => {
    it('should return Stream token', async () => {
      authService.getStreamToken.mockResolvedValue({ token: 'stream-token' });

      const result = await controller.getStreamToken('test-user-id');

      expect(result).toEqual({ token: 'stream-token' });
      expect(authService.getStreamToken).toHaveBeenCalledWith('test-user-id');
    });

    it('should propagate error when Stream not configured', async () => {
      authService.getStreamToken.mockRejectedValue(new Error('Stream Chat not configured'));

      await expect(controller.getStreamToken('test-user-id')).rejects.toThrow('Stream Chat not configured');
    });
  });
});