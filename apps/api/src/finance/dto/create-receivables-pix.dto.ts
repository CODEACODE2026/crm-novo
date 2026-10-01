import { PaymentProviderCode } from '@prisma/client';
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

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
