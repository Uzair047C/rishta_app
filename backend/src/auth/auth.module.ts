import { Module } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { JwtAuthGuard } from './jwt-auth.guard';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    UsersService,
    JwtService,
    ConfigService,
    Reflector,
    JwtAuthGuard,
  ],
  exports: [AuthService, JwtService, JwtAuthGuard],
})
export class AuthModule {}