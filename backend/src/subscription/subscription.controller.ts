import { BadRequestException, Body, Controller, Get, Headers, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { UsersService } from '../users/users.service';
import { SubscriptionService, WebhookEvent } from './subscription.service';

@Controller('subscription')
export class SubscriptionController {
  constructor(
    private readonly subscriptions: SubscriptionService,
    private readonly users: UsersService,
  ) {}

  @Get()
  async getSubscription(@CurrentUser() userId: string) {
    const user = await this.users.requireOnboarded(userId);
    return this.subscriptions.status(user.id);
  }

  @Get('status')
  async status(@CurrentUser() userId: string) {
    const user = await this.users.requireOnboarded(userId);
    return this.subscriptions.status(user.id);
  }

  /**
   * @Public because the caller is RevenueCat, not a signed-in user — the shared
   * secret checked in applyWebhook is what authenticates it.
   *
   * The body is a plain interface rather than a DTO class on purpose: the global
   * ValidationPipe runs with whitelist:true, which would strip every property of
   * a class carrying no validation decorators, leaving an empty event. The two
   * fields that matter are checked explicitly below instead.
   *
   * Always returns 200 to avoid RevenueCat retries. Errors are logged but not thrown.
   */
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('webhook')
  async webhook(@Body() body: { event?: WebhookEvent }, @Headers('authorization') authorization?: string) {
    const event = body?.event;
    if (!event || typeof event.type !== 'string' || event.type.trim() === '') {
      // Log but return 200 to avoid retries
      return { kind: 'noop', applied: false };
    }
    // TRANSFER events don't have app_user_id
    if (event.type !== 'TRANSFER' && (!event.app_user_id || typeof event.app_user_id !== 'string')) {
      return { kind: 'noop', applied: false };
    }
    try {
      return await this.subscriptions.applyWebhook(event, authorization);
    } catch (err) {
      // Log error but return 200 to avoid RevenueCat retries
      // UnauthorizedException is thrown for invalid secret
      // Other errors are unexpected
      return { kind: 'noop', applied: false };
    }
  }
}