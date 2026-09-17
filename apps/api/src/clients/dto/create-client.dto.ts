import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';
import { ReferralRewardType } from '@prisma/client';

export class CreateClientDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @MinLength(8)
  phone!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

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

  @IsOptional()
  @IsBoolean()
  generateInitialReceivable?: boolean;
}
