import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserRow } from '../db/types';

export const CurrentUser = createParamDecorator(
  (data: keyof UserRow | undefined, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest();
    const user = request.user as UserRow | undefined;
    if (!user) return undefined;
    if (data) return user[data];
    return user;
  },
);