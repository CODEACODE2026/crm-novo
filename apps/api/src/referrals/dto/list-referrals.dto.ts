import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { ReferralStatus } from '@prisma/client';

export class ListReferralsDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(ReferralStatus)
  status?: ReferralStatus;

  @IsOptional()
  @IsUUID()
  referrerClientId?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;
}
