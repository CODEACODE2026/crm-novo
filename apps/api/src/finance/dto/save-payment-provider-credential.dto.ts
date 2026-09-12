import { PaymentProviderCode } from '@prisma/client';
import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';

export class SavePaymentProviderCredentialDto {
  @IsEnum(PaymentProviderCode)
  provider!: PaymentProviderCode;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(512)
  token!: string;
}

export class SavePaymentWebhookSecretDto {
  @IsString()
  @MinLength(16)
  @MaxLength(512)
  secret!: string;
}
