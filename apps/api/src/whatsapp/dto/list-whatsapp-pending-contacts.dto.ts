import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { WhatsAppPendingContactStatus } from '@prisma/client';

export class ListWhatsAppPendingContactsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number = 20;

  @IsOptional()
  @IsEnum(WhatsAppPendingContactStatus)
  status?: WhatsAppPendingContactStatus;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsUUID()
  connectionId?: string;

  @IsOptional()
  @IsIn(['lastContactAt', 'firstContactAt', 'contactName', 'messageCount'])
  sortBy?: 'lastContactAt' | 'firstContactAt' | 'contactName' | 'messageCount' = 'lastContactAt';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDirection?: 'asc' | 'desc' = 'desc';
}
