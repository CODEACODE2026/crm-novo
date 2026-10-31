import { Controller, Get, Header, Inject, Param, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { ListReportDto } from './dto/list-report.dto';
import { ReportsOverviewDto } from './dto/reports-overview.dto';
import { ReportsIntelligenceService } from './reports-intelligence.service';
import { ReportsService, type ReportType } from './reports.service';

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('reports')
export class ReportsController {
  constructor(
    @Inject(ReportsService) private readonly reportsService: ReportsService,
    @Inject(ReportsIntelligenceService)
    private readonly reportsIntelligenceService: ReportsIntelligenceService,
  ) {}

  @Get('intelligence/overview')
  overview(@Query() query: ReportsOverviewDto) {
    return this.reportsIntelligenceService.overview(query);
  }

  @Get(':type.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async csv(
    @Param('type') type: ReportType,
    @Query() query: ListReportDto,
    @Res() response: Response,
  ) {
    const file = await this.reportsService.csv(type, query);
    response.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    response.send(file.content);
  }

  @Get(':type')
  list(@Param('type') type: ReportType, @Query() query: ListReportDto) {
    return this.reportsService.list(type, query);
  }
}
