import { Controller, Delete, Get, HttpCode, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/auth/decorators';
import { notImplemented } from '../../common/errors/app.exception';
import { OccupancyEventsService } from '../events/occupancy-events.service';
import { AVATAR_UPLOAD_BODY, avatarInterceptor } from './avatar-upload';
import { AvatarsService } from './avatars.service';
import type { UploadedImage } from './avatars.service';
import { UserResponse } from './dto/user.dto';
import { SessionsService } from './sessions.service';
import { UsersService } from './users.service';

@ApiTags('Auth')
@ApiBearerAuth('bearerAuth')
@Controller('me')
export class MeController {
  constructor(
    private readonly users: UsersService,
    private readonly sessions: SessionsService,
    private readonly events: OccupancyEventsService,
    private readonly avatars: AvatarsService,
  ) {}

  @Get()
  @ApiOperation({ operationId: 'getCurrentUser', summary: 'Profilul utilizatorului curent' })
  @ApiOkResponse({ type: UserResponse })
  async me(@CurrentUser() user: AuthUser): Promise<UserResponse> {
    return this.users.toResponse(await this.users.getById(user.id));
  }

  @Delete()
  @HttpCode(204)
  @ApiOperation({ operationId: 'deleteCurrentUser', summary: 'Șterge contul și datele personale' })
  @ApiNoContentResponse({ description: 'Cont șters.' })
  async deleteMe(@CurrentUser() user: AuthUser): Promise<void> {
    const cancelled = await this.users.deleteSelf(user);
    await this.sessions.revokeAll(user.id);
    await this.events.bookingsCancelled(cancelled, { source: 'user' }, true);
  }

  @Post('avatar')
  @HttpCode(200)
  @UseInterceptors(avatarInterceptor())
  @ApiOperation({ operationId: 'uploadMyAvatar', summary: 'Încarcă fotografia de profil' })
  @ApiConsumes('multipart/form-data')
  @ApiBody(AVATAR_UPLOAD_BODY)
  @ApiOkResponse({ type: UserResponse, description: 'Profilul cu noul `avatar_url`.' })
  @ApiUnprocessableEntityResponse({ description: 'Imagine nevalidă (`IMAGE_INVALID`).' })
  uploadAvatar(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: UploadedImage | undefined,
  ): Promise<UserResponse> {
    return this.avatars.set(user.id, file);
  }

  @Delete('avatar')
  @ApiOperation({ operationId: 'deleteMyAvatar', summary: 'Șterge fotografia de profil' })
  @ApiOkResponse({ type: UserResponse, description: 'Profilul, fără fotografie.' })
  deleteAvatar(@CurrentUser() user: AuthUser): Promise<UserResponse> {
    return this.avatars.remove(user.id);
  }

  @Get('export')
  @ApiOperation({
    operationId: 'exportCurrentUserData',
    summary: 'Descarcă datele personale (JSON) — neimplementat (501)',
  })
  exportData(): never {
    notImplemented();
  }
}
