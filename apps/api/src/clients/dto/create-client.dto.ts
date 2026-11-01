import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  Matches,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';
import { PaymentProviderCode, ReferralRewardType } from '@prisma/client';
import { NormalizeOptionalEmail } from './optional-email';

export class CreateClientDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @MinLength(8)
  phone!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{2}$/)
  phoneCountry?: string;

  @IsOptional()
  @NormalizeOptionalEmail()
  @IsEmail()
  email?: string | null;

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
  @IsEnum(PaymentProviderCode)
  preferredPixProvider?: PaymentProviderCode | null;

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
