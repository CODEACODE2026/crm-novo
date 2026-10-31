import { IsIn, IsOptional, Matches } from 'class-validator';
import { reportingPeriodPresets, type ReportingPeriodPreset } from '../reporting-period';

export class ReportsOverviewDto {
  @IsOptional()
  @IsIn(reportingPeriodPresets)
  preset?: ReportingPeriodPreset;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startDate?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  endDate?: string;
}
