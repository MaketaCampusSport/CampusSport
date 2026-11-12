import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiConflictResponse, ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth.types';
import { CurrentUser, Roles } from '../../common/auth/decorators';
import { notImplemented } from '../../common/errors/app.exception';
import { UuidParamPipe } from '../../common/http/uuid.pipe';
import { BlocksService } from './blocks.service';
import { BlockCreateDto, BlockPage, BlockResultResponse, DeliveryStatusResponse, ListBlocksQueryDto } from './dto/block.dto';

@ApiTags('Blocări')
@ApiBearerAuth('bearerAuth')
@Roles('admin')
@Controller('admin')
export class BlocksController {
  constructor(private readonly blocks: BlocksService) {}

  @Get('blocks')
  @ApiOperation({ operationId: 'listBlocks', summary: 'Lista blocărilor' })
  @ApiOkResponse({ type: BlockPage })
  list(@Query() query: ListBlocksQueryDto) {
    return this.blocks.list(query);
  }

  @Post('blocks')
  @ApiOperation({ operationId: 'createBlock', summary: 'Blocare de urgență sau planificată' })
  @ApiCreatedResponse({ type: BlockResultResponse })
  @ApiConflictResponse({ description: 'Există deja o blocare de același nivel pe interval (`BLOCK_CONFLICT`).' })
  create(@CurrentUser() actor: AuthUser, @Body() dto: BlockCreateDto): Promise<BlockResultResponse> {
    return this.blocks.create(actor, dto);
  }

  @Delete('blocks/:id')
  @HttpCode(204)
  @ApiOperation({ operationId: 'deleteBlock', summary: 'Deblocare' })
  @ApiNoContentResponse({ description: 'Resursă deblocată.' })
  remove(@CurrentUser() actor: AuthUser, @Param('id', UuidParamPipe) id: string): Promise<void> {
    return this.blocks.remove(actor, id);
  }

  @Get('blocks/:id/delivery')
  @ApiOperation({ operationId: 'getBlockDelivery', summary: 'Contorul „anunțați / livrați”' })
  @ApiOkResponse({ type: DeliveryStatusResponse })
  delivery(@Param('id', UuidParamPipe) id: string): Promise<DeliveryStatusResponse> {
    return this.blocks.delivery(id);
  }

  // ---------- PE schedule and events: stubbed (501) ----------

  @Post('schedule/import')
  @ApiOperation({ operationId: 'importSchedule', summary: 'Import orar EF (CSV/iCal) — neimplementat (501)' })
  importSchedule(): never {
    notImplemented();
  }

  @Post('schedule/import/:id/confirm')
  @ApiOperation({ operationId: 'confirmScheduleImport', summary: 'Confirmă importul — neimplementat (501)' })
  confirmImport(@Param('id', UuidParamPipe) _id: string): never {
    notImplemented();
  }

  @Post('schedule/classes')
  @ApiOperation({ operationId: 'createScheduleClass', summary: 'Oră EF recurentă — neimplementat (501)' })
  createClass(): never {
    notImplemented();
  }

  @Delete('schedule/recurrences/:id')
  @ApiOperation({ operationId: 'deleteScheduleRecurrence', summary: 'Șterge o oră EF recurentă — neimplementat (501)' })
  deleteRecurrence(@Param('id', UuidParamPipe) _id: string): never {
    notImplemented();
  }

  @Post('events')
  @ApiOperation({ operationId: 'createEvent', summary: 'Rezervare pentru un eveniment — neimplementat (501)' })
  createEvent(): never {
    notImplemented();
  }
}
