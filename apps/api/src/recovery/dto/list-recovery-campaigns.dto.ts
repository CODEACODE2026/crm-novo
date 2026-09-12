import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { RecoveryCampaignStatus } from '@prisma/client';

export class ListRecoveryCampaignsDto {
  @IsOptional()
  @IsEnum(RecoveryCampaignStatus)
  status?: RecoveryCampaignStatus;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;
}
