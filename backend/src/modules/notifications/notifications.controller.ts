import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth.types';
import { CurrentUser, Roles } from '../../common/auth/decorators';
import { notImplemented } from '../../common/errors/app.exception';
import { UuidParamPipe } from '../../common/http/uuid.pipe';
import type { NotificationPreferencesValue } from '../../database/entities';
import {
  NotificationPreferencesDto,
  PushSubscriptionInputDto,
  PushSubscriptionResponse,
} from './dto/notifications.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('Notificări')
@ApiBearerAuth('bearerAuth')
@Controller()
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Post('me/push-subscriptions')
  @ApiOperation({
    operationId: 'registerPushSubscription',
    summary: 'Înregistrează dispozitivul pentru notificări push',
  })
  @ApiCreatedResponse({ type: PushSubscriptionResponse })
  register(
    @CurrentUser() user: AuthUser,
    @Body() dto: PushSubscriptionInputDto,
  ): Promise<PushSubscriptionResponse> {
    return this.notifications.registerPush(user, dto);
  }

  @Delete('me/push-subscriptions/:id')
  @HttpCode(204)
  @ApiOperation({ operationId: 'deletePushSubscription', summary: 'Șterge un dispozitiv' })
  @ApiNoContentResponse()
  remove(@CurrentUser() user: AuthUser, @Param('id', UuidParamPipe) id: string): Promise<void> {
    return this.notifications.deletePush(user, id);
  }

  @Get('me/notification-preferences')
  @ApiOperation({ operationId: 'getNotificationPreferences', summary: 'Canalele preferate' })
  @ApiOkResponse({ type: NotificationPreferencesDto })
  getPreferences(@CurrentUser() user: AuthUser): Promise<NotificationPreferencesValue> {
    return this.notifications.getPreferences(user);
  }

  @Put('me/notification-preferences')
  @ApiOperation({ operationId: 'updateNotificationPreferences', summary: 'Alege canalele preferate' })
  @ApiOkResponse({ type: NotificationPreferencesDto })
  updatePreferences(
    @CurrentUser() user: AuthUser,
    @Body() dto: NotificationPreferencesDto,
  ): Promise<NotificationPreferencesValue> {
    return this.notifications.updatePreferences(user, dto);
  }

  @Roles('admin')
  @Post('admin/announcements')
  @ApiOperation({
    operationId: 'createAnnouncement',
    summary: 'Anunț către utilizatori — neimplementat (501)',
  })
  announce(): never {
    notImplemented();
  }
}
