import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth.types';
import { CurrentUser, Roles } from '../../common/auth/decorators';
import { UuidParamPipe } from '../../common/http/uuid.pipe';
import { ListUsersQueryDto, SuspendUserDto, UserPage, UserResponse } from './dto/user.dto';
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
  ) {}

  @Get()
  @ApiOperation({ operationId: 'listUsers', summary: 'Caută utilizatori' })
  @ApiOkResponse({ type: UserPage })
  list(@Query() query: ListUsersQueryDto) {
    return this.users.list(query);
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
