import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth.types';
import { CurrentUser, Roles } from '../../common/auth/decorators';
import { UuidParamPipe } from '../../common/http/uuid.pipe';
import type { NotificationPreferencesValue } from '../../database/entities';
import { AnnouncementsService } from './announcements.service';
import {
  AnnouncementCreateDto,
  AnnouncementResultResponse,
  NotificationPreferencesDto,
  PushSubscriptionInputDto,
  PushSubscriptionResponse,
} from './dto/notifications.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('Notificări')
@ApiBearerAuth('bearerAuth')
@Controller()
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly announcements: AnnouncementsService,
  ) {}

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
  @HttpCode(202)
  @ApiOperation({
    operationId: 'createAnnouncement',
    summary: 'Anunț către utilizatorii unei resurse sau ai unui interval',
  })
  @ApiAcceptedResponse({ type: AnnouncementResultResponse, description: 'Anunț pus în coadă.' })
  announce(
    @CurrentUser() actor: AuthUser,
    @Body() dto: AnnouncementCreateDto,
  ): Promise<AnnouncementResultResponse> {
    return this.announcements.create(actor, dto);
  }
}
