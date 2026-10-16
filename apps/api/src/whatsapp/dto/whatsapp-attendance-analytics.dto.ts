import { WhatsAppAttendanceStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsUUID, Matches } from 'class-validator';

export class WhatsAppAttendanceAnalyticsDto {
  @IsOptional()
  @IsUUID()
  connectionId?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dateFrom?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dateTo?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsEnum(WhatsAppAttendanceStatus)
  status?: WhatsAppAttendanceStatus;
}
