import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Res } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import type { AuthUser } from '../../common/auth/auth.types';
import { CurrentUser, Public, Roles } from '../../common/auth/decorators';
import { notImplemented } from '../../common/errors/app.exception';
import { UuidParamPipe } from '../../common/http/uuid.pipe';
import { API_PREFIX } from '../../app.setup';
import { BookingsService } from './bookings.service';
import {
  BookingCreateDto,
  BookingPage,
  BookingResponse,
  CancellationResultResponse,
  CheckInDto,
  CheckInResultResponse,
  MyBookingsQueryDto,
  QuotaResponse,
} from './dto/booking.dto';

/** SDD 8.1: 10 bookings per minute per user. */
export const BOOKING_RATE_LIMIT = { default: { limit: 10, ttl: 60_000 } };

@ApiTags('Rezervări')
@ApiBearerAuth('bearerAuth')
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Post()
  @Throttle(BOOKING_RATE_LIMIT)
  @ApiOperation({ operationId: 'createBooking', summary: 'Creează o rezervare' })
  @ApiCreatedResponse({
    type: BookingResponse,
    description: 'Rezervare creată; confirmarea și reminderele sunt puse în coadă.',
  })
  @ApiConflictResponse({
    description: 'Slot ocupat (`SLOT_TAKEN`) sau blocat (`SLOT_BLOCKED`), cu `waitlist_offer`.',
  })
  @ApiUnprocessableEntityResponse({ description: 'O regulă de rezervare este încălcată.' })
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: BookingCreateDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<BookingResponse> {
    const booking = await this.bookings.create(user, dto);
    res.setHeader('Location', `/${API_PREFIX}/bookings/${booking.id}`);
    return booking;
  }

  @Get(':id')
  @ApiOperation({ operationId: 'getBooking', summary: 'Detaliile unei rezervări' })
  @ApiOkResponse({ type: BookingResponse })
  get(@CurrentUser() user: AuthUser, @Param('id', UuidParamPipe) id: string): Promise<BookingResponse> {
    return this.bookings.get(user, id);
  }

  @Delete(':id')
  @HttpCode(200)
  @ApiOperation({ operationId: 'cancelBooking', summary: 'Anulează și eliberează slotul' })
  @ApiOkResponse({ type: CancellationResultResponse })
  @ApiConflictResponse({
    description: 'Rezervarea nu mai este activă sau slotul a început (`BOOKING_NOT_CANCELLABLE`).',
  })
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', UuidParamPipe) id: string,
  ): Promise<CancellationResultResponse> {
    return this.bookings.cancel(user, id);
  }

  @Post(':id/check-in')
  @HttpCode(200)
  @ApiOperation({ operationId: 'checkInBooking', summary: 'Check-in prin QR sau buton' })
  @ApiOkResponse({ type: CheckInResultResponse })
  checkIn(
    @CurrentUser() user: AuthUser,
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: CheckInDto,
  ): Promise<CheckInResultResponse> {
    return this.bookings.checkIn(user, id, dto);
  }

  @Get(':id/calendar.ics')
  @ApiOperation({
    operationId: 'downloadBookingCalendar',
    summary: 'Fișier iCal pentru o rezervare — neimplementat (501)',
  })
  calendar(@Param('id', UuidParamPipe) _id: string): never {
    notImplemented();
  }

  @Post(':id/invitations')
  @ApiOperation({
    operationId: 'createBookingInvitation',
    summary: 'Link de invitație pentru echipă — neimplementat (501)',
  })
  invite(@Param('id', UuidParamPipe) _id: string): never {
    notImplemented();
  }
}

@ApiTags('Rezervări')
@Controller()
export class PublicBookingLinksController {
  @Public()
  @Get('invitations/:token')
  @ApiOperation({ operationId: 'getInvitation', summary: 'Detaliile unei invitații — neimplementat (501)' })
  invitation(@Param('token') _token: string): never {
    notImplemented();
  }

  @Public()
  @Get('calendar/:token.ics')
  @ApiOperation({
    operationId: 'getCalendarFeedFile',
    summary: 'Abonament iCal personal — neimplementat (501)',
  })
  calendarFeedFile(@Param('token') _token: string): never {
    notImplemented();
  }
}

@ApiTags('Rezervări')
@ApiBearerAuth('bearerAuth')
@Controller('me')
export class MyBookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Get('bookings')
  @ApiOperation({ operationId: 'listMyBookings', summary: 'Rezervări viitoare și istoric' })
  @ApiOkResponse({ type: BookingPage })
  list(@CurrentUser() user: AuthUser, @Query() query: MyBookingsQueryDto) {
    return this.bookings.listMine(user, query);
  }

  @Get('calendar-feed')
  @ApiOperation({
    operationId: 'getCalendarFeed',
    summary: 'Linkul abonamentului iCal personal — neimplementat (501)',
  })
  calendarFeed(): never {
    notImplemented();
  }

  @Roles('student')
  @Get('quota')
  @ApiTags('Cote')
  @ApiOperation({ operationId: 'getMyQuota', summary: 'Intrări folosite și rămase în luna curentă' })
  @ApiOkResponse({ type: QuotaResponse })
  quota(@CurrentUser() user: AuthUser): Promise<QuotaResponse> {
    return this.bookings.myQuota(user);
  }
}

@ApiTags('Rezervări')
@ApiBearerAuth('bearerAuth')
@Roles('admin')
@Controller('admin/bookings')
export class AdminBookingsController {
  @Get()
  @ApiOperation({
    operationId: 'listBookings',
    summary: 'Toate rezervările, cu filtre — neimplementat (501)',
  })
  list(): never {
    notImplemented();
  }

  @Patch(':id')
  @ApiOperation({
    operationId: 'rescheduleBooking',
    summary: 'Schimbă ora unei rezervări — neimplementat (501)',
  })
  reschedule(@Param('id', UuidParamPipe) _id: string): never {
    notImplemented();
  }

  @Post(':id/cancel')
  @ApiOperation({
    operationId: 'adminCancelBooking',
    summary: 'Anulare de către administrator — neimplementat (501)',
  })
  cancel(@Param('id', UuidParamPipe) _id: string): never {
    notImplemented();
  }
}
