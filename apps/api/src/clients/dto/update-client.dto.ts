import { PaymentProviderCode } from '@prisma/client';
import { IsEmail, IsEnum, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { NormalizeOptionalEmail } from './optional-email';

export class UpdateClientDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  phone?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{2}$/)
  phoneCountry?: string;

  @IsOptional()
  @NormalizeOptionalEmail()
  @IsEmail()
  email?: string | null;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsEnum(PaymentProviderCode)
  preferredPixProvider?: PaymentProviderCode | null;
}
