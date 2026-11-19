import { Body, Controller, Get, Put, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { AuthUser } from '../../common/auth/auth.types';
import { CurrentUser, Roles } from '../../common/auth/decorators';
import { notImplemented } from '../../common/errors/app.exception';
import { AdminService } from './admin.service';
import { DashboardService } from './dashboard.service';
import { AuditPage, AuditQueryDto, SettingsDto, SettingsResponse } from './dto/admin.dto';
import { DashboardQueryDto, DashboardResponse } from './dto/dashboard.dto';
import { MonthlyReportResponse, ReportQueryDto } from './dto/report.dto';
import { reportToCsv } from './monthly-report';
import { ReportsService } from './reports.service';

@ApiTags('Administrare și rapoarte')
@ApiBearerAuth('bearerAuth')
@Roles('admin')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly dashboards: DashboardService,
    private readonly reports: ReportsService,
  ) {}

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
  @ApiOperation({ operationId: 'getDashboard', summary: 'Panoul zilei' })
  @ApiOkResponse({ type: DashboardResponse })
  dashboard(@CurrentUser() actor: AuthUser, @Query() query: DashboardQueryDto): Promise<DashboardResponse> {
    return this.dashboards.dashboard(actor, query.date);
  }

  /** `format=csv` downloads a flat table; `format=pdf` is not implemented yet (501). */
  @Get('reports')
  @ApiOperation({
    operationId: 'getMonthlyReport',
    summary: 'Rapoarte lunare, export CSV/PDF (PDF neimplementat, 501)',
  })
  @ApiProduces('application/json', 'text/csv', 'application/pdf')
  @ApiOkResponse({ type: MonthlyReportResponse })
  async report(
    @Query() query: ReportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MonthlyReportResponse | string> {
    if (query.format === 'pdf') notImplemented();
    const report = await this.reports.monthlyReport(query.month);
    if (query.format !== 'csv') return report;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="campussport-raport-${query.month}.csv"`);
    return reportToCsv(report);
  }
}
