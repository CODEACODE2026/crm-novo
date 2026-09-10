import { IsOptional, IsString } from 'class-validator';

export class FinancialSummaryDto {
  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;
}
