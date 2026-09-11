import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
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
}
