import { PaymentProviderCode } from '@prisma/client';
import { NormalizeOptionalEmail } from '../../clients/dto/optional-email';
import {
  ArrayNotEmpty,
  IsArray,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateReceivablePixDto {
  @IsOptional()
  @IsEnum(PaymentProviderCode)
  provider?: PaymentProviderCode;

  @IsOptional()
  @NormalizeOptionalEmail()
  @IsEmail()
  @MaxLength(254)
  payerEmail?: string;
}

export class CreateReceivablesPixDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  receivableIds!: string[];

  @IsOptional()
  @IsEnum(PaymentProviderCode)
  provider?: PaymentProviderCode;
}

export class ReplaceReceivablesPixDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  receivableIds!: string[];

  @IsEnum(PaymentProviderCode)
  provider!: PaymentProviderCode;

  @IsUUID()
  expectedCurrentIntentId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  idempotencyKey?: string;
}
