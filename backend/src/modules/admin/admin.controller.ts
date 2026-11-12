import { Body, Controller, Get, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth.types';
import { CurrentUser, Roles } from '../../common/auth/decorators';
import { notImplemented } from '../../common/errors/app.exception';
import { AdminService } from './admin.service';
import { AuditPage, AuditQueryDto, SettingsDto, SettingsResponse } from './dto/admin.dto';

@ApiTags('Administrare și rapoarte')
@ApiBearerAuth('bearerAuth')
@Roles('admin')
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('settings')
  @ApiOperation({ operationId: 'getSettings', summary: 'Citire reguli' })
  @ApiOkResponse({ type: SettingsResponse })
  getSettings(): Promise<SettingsResponse> {
    return this.admin.getSettings();
  }

  @Put('settings')
  @ApiOperation({ operationId: 'updateSettings', summary: 'Modificare reguli' })
  @ApiOkResponse({ type: SettingsResponse })
  updateSettings(@CurrentUser() actor: AuthUser, @Body() dto: SettingsDto): Promise<SettingsResponse> {
    return this.admin.updateSettings(actor, dto);
  }

  @Get('audit-log')
  @ApiOperation({ operationId: 'listAuditLog', summary: 'Jurnal de audit' })
  @ApiOkResponse({ type: AuditPage })
  auditLog(@Query() query: AuditQueryDto) {
    return this.admin.auditLog(query);
  }

  @Get('dashboard')
  @ApiOperation({ operationId: 'getDashboard', summary: 'Panoul zilei — neimplementat (501)' })
  dashboard(): never {
    notImplemented();
  }

  @Get('reports')
  @ApiOperation({
    operationId: 'getMonthlyReport',
    summary: 'Rapoarte lunare, export CSV/PDF — neimplementat (501)',
  })
  reports(): never {
    notImplemented();
  }
}
