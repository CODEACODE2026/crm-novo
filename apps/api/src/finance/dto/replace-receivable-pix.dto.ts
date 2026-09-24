import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaymentProviderCode } from '@prisma/client';

export class ReplaceReceivablePixPreviewDto {
  @IsEnum(PaymentProviderCode)
  provider!: PaymentProviderCode;
}

export class ReplaceReceivablePixDto extends ReplaceReceivablePixPreviewDto {
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

export class RecoverReceivablePixReplacementPreviewDto extends ReplaceReceivablePixPreviewDto {
  @IsString()
  @MaxLength(120)
  providerTransactionId!: string;
}

export class RecoverReceivablePixReplacementDto extends RecoverReceivablePixReplacementPreviewDto {
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
