import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { ForbiddenException } from '@nestjs/common';

@Injectable()
export class OnboardedGuard implements CanActivate {
  constructor(private readonly usersService: UsersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // This will throw ForbiddenException if profile is incomplete
    await this.usersService.requireOnboarded();
    return true;
  }
}