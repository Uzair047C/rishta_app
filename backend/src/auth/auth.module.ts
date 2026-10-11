import { Module } from '@nestjs/common';
import { GoogleStrategy } from './google.strategy';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [JwtModule.register({})],
  providers: [GoogleStrategy, UsersService, AuthService],
})
export class AuthModule {}