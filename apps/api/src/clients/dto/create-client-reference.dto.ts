import { Type } from 'class-transformer';
import { ReferralRewardType } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';

export class CreateClientReferenceDto {
  @IsString()
  @MinLength(2)
  reference!: string;

  @IsUUID()
  planId!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  recurringValue!: number;

  @IsString()
  dueDate!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  billingNoticeDays!: number;

  @IsOptional()
  @IsBoolean()
  internationalBillingEnabled?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsUUID()
  referrerClientId?: string;

  @IsOptional()
  @IsEnum(ReferralRewardType)
  referralRewardType?: ReferralRewardType;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  referralRewardValue?: number;

  @IsOptional()
  @IsString()
  referralRewardDescription?: string;
}
