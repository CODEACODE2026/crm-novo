import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaymentProviderCode } from '@prisma/client';

export class ReconcileReceivablePixPreviewDto {
  @IsEnum(PaymentProviderCode)
  provider!: PaymentProviderCode;

  @IsString()
  @MaxLength(120)
  providerTransactionId!: string;
}

export class ReconcileReceivablePixDto extends ReconcileReceivablePixPreviewDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  idempotencyKey?: string;
}
