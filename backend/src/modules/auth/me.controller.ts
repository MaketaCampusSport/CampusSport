import { Controller, Delete, Get, HttpCode } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/auth/decorators';
import { notImplemented } from '../../common/errors/app.exception';
import { OccupancyEventsService } from '../events/occupancy-events.service';
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

  @Get('export')
  @ApiOperation({
    operationId: 'exportCurrentUserData',
    summary: 'Descarcă datele personale (JSON) — neimplementat (501)',
  })
  exportData(): never {
    notImplemented();
  }
}
