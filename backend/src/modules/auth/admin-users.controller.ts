import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth.types';
import { CurrentUser, Roles } from '../../common/auth/decorators';
import { UuidParamPipe } from '../../common/http/uuid.pipe';
import { OccupancyEventsService } from '../events/occupancy-events.service';
import { AVATAR_UPLOAD_BODY, avatarInterceptor } from './avatar-upload';
import { AvatarsService } from './avatars.service';
import type { UploadedImage } from './avatars.service';
import {
  CreateUserDto,
  ListUsersQueryDto,
  SuspendUserDto,
  UpdateUserDto,
  UserPage,
  UserResponse,
} from './dto/user.dto';
import { SessionsService } from './sessions.service';
import { UsersService } from './users.service';

@ApiTags('Auth')
@ApiBearerAuth('bearerAuth')
@Roles('admin')
@Controller('admin/users')
export class AdminUsersController {
  constructor(
    private readonly users: UsersService,
    private readonly sessions: SessionsService,
    private readonly avatars: AvatarsService,
    private readonly events: OccupancyEventsService,
  ) {}

  @Get()
  @ApiOperation({ operationId: 'listUsers', summary: 'Caută utilizatori' })
  @ApiOkResponse({ type: UserPage })
  list(@Query() query: ListUsersQueryDto) {
    return this.users.list(query);
  }

  @Post()
  @HttpCode(201)
  @ApiOperation({ operationId: 'createUser', summary: 'Creează un cont' })
  @ApiCreatedResponse({ type: UserResponse, description: 'Cont creat.' })
  @ApiConflictResponse({ description: 'Există deja un cont cu acest email (`EMAIL_ALREADY_USED`).' })
  create(@CurrentUser() actor: AuthUser, @Body() dto: CreateUserDto): Promise<UserResponse> {
    return this.users.createByAdmin(actor, dto);
  }

  @Patch(':id')
  @ApiOperation({ operationId: 'updateUser', summary: 'Modifică un cont' })
  @ApiOkResponse({ type: UserResponse, description: 'Contul modificat.' })
  @ApiConflictResponse({ description: 'Există deja un cont cu acest email (`EMAIL_ALREADY_USED`).' })
  async update(
    @CurrentUser() actor: AuthUser,
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: UpdateUserDto,
  ): Promise<UserResponse> {
    const { user, signOut } = await this.users.updateByAdmin(actor, id, dto);
    if (signOut) await this.sessions.revokeAll(id);
    return user;
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ operationId: 'deleteUser', summary: 'Șterge un cont' })
  @ApiNoContentResponse({ description: 'Cont șters.' })
  @ApiConflictResponse({ description: 'Contul apare în jurnalul de audit (`USER_HAS_HISTORY`).' })
  async remove(@CurrentUser() actor: AuthUser, @Param('id', UuidParamPipe) id: string): Promise<void> {
    const cancelled = await this.users.deleteByAdmin(actor, id);
    await this.sessions.revokeAll(id);
    await this.events.bookingsCancelled(cancelled, { source: 'admin' }, true);
  }

  @Post(':id/avatar')
  @HttpCode(200)
  @UseInterceptors(avatarInterceptor())
  @ApiOperation({ operationId: 'uploadUserAvatar', summary: 'Încarcă fotografia unui utilizator' })
  @ApiConsumes('multipart/form-data')
  @ApiBody(AVATAR_UPLOAD_BODY)
  @ApiOkResponse({ type: UserResponse, description: 'Contul cu noul `avatar_url`.' })
  @ApiUnprocessableEntityResponse({ description: 'Imagine nevalidă (`IMAGE_INVALID`).' })
  uploadAvatar(
    @CurrentUser() actor: AuthUser,
    @Param('id', UuidParamPipe) id: string,
    @UploadedFile() file: UploadedImage | undefined,
  ): Promise<UserResponse> {
    return this.avatars.set(id, file, actor);
  }

  @Delete(':id/avatar')
  @ApiOperation({ operationId: 'deleteUserAvatar', summary: 'Șterge fotografia unui utilizator' })
  @ApiOkResponse({ type: UserResponse, description: 'Contul, fără fotografie.' })
  deleteAvatar(
    @CurrentUser() actor: AuthUser,
    @Param('id', UuidParamPipe) id: string,
  ): Promise<UserResponse> {
    return this.avatars.remove(id, actor);
  }

  @Post(':id/suspend')
  @HttpCode(200)
  @ApiOperation({ operationId: 'suspendUser', summary: 'Suspendă temporar un cont' })
  @ApiOkResponse({ type: UserResponse, description: 'Cont suspendat.' })
  async suspend(
    @CurrentUser() actor: AuthUser,
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: SuspendUserDto,
  ): Promise<UserResponse> {
    const user = await this.users.suspend(actor, id, new Date(dto.until), dto.reason);
    await this.sessions.revokeAll(id);
    return user;
  }

  @Post(':id/reactivate')
  @HttpCode(200)
  @ApiOperation({ operationId: 'reactivateUser', summary: 'Ridică suspendarea unui cont' })
  @ApiOkResponse({ type: UserResponse, description: 'Cont reactivat.' })
  reactivate(@CurrentUser() actor: AuthUser, @Param('id', UuidParamPipe) id: string): Promise<UserResponse> {
    return this.users.reactivate(actor, id);
  }
}
