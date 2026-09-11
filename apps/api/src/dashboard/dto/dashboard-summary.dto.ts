import { IsOptional, IsString } from 'class-validator';

export class DashboardSummaryDto {
  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;
}
