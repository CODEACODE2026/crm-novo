import { Controller, Get, Header, Inject, Param, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ListReportDto } from './dto/list-report.dto';
import { ReportsService, type ReportType } from './reports.service';

@UseGuards(JwtAuthGuard)
@Controller('reports')
export class ReportsController {
  constructor(@Inject(ReportsService) private readonly reportsService: ReportsService) {}

  @Get(':type')
  list(@Param('type') type: ReportType, @Query() query: ListReportDto) {
    return this.reportsService.list(type, query);
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
}
