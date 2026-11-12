import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/auth/decorators';
import { UuidParamPipe } from '../../common/http/uuid.pipe';
import { BookingResponse } from '../bookings/dto/booking.dto';
import { WaitlistEntryResponse, WaitlistJoinDto } from './dto/waitlist.dto';
import { WaitlistService } from './waitlist.service';

@ApiTags('Listă de așteptare')
@ApiBearerAuth('bearerAuth')
@Controller()
export class WaitlistController {
  constructor(private readonly waitlist: WaitlistService) {}

  @Post('waitlist')
  @ApiOperation({ operationId: 'joinWaitlist', summary: 'Înscriere pe slot sau abonare la zi + sport' })
  @ApiCreatedResponse({ type: WaitlistEntryResponse })
  join(@CurrentUser() user: AuthUser, @Body() dto: WaitlistJoinDto): Promise<WaitlistEntryResponse> {
    return this.waitlist.join(user, dto);
  }

  @Get('me/waitlist')
  @ApiOperation({ operationId: 'listMyWaitlist', summary: 'Înscrierile mele' })
  @ApiOkResponse({ type: [WaitlistEntryResponse] })
  listMine(@CurrentUser() user: AuthUser): Promise<WaitlistEntryResponse[]> {
    return this.waitlist.listMine(user);
  }

  @Delete('waitlist/:id')
  @HttpCode(204)
  @ApiOperation({ operationId: 'leaveWaitlist', summary: 'Renunță la înscriere' })
  @ApiNoContentResponse()
  leave(@CurrentUser() user: AuthUser, @Param('id', UuidParamPipe) id: string): Promise<void> {
    return this.waitlist.leave(user, id);
  }

  @Post('waitlist/:id/accept')
  @ApiOperation({ operationId: 'acceptWaitlistOffer', summary: 'Acceptă oferta pentru locul eliberat' })
  @ApiCreatedResponse({ type: BookingResponse, description: 'Loc obținut; rezervarea a fost creată.' })
  accept(@CurrentUser() user: AuthUser, @Param('id', UuidParamPipe) id: string): Promise<BookingResponse> {
    return this.waitlist.accept(user, id);
  }
}
