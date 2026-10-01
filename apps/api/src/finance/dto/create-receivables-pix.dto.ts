import { PaymentProviderCode } from '@prisma/client';
import { ArrayNotEmpty, IsArray, IsEnum, IsOptional, IsUUID } from 'class-validator';

export class CreateReceivablesPixDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  receivableIds!: string[];

  @IsOptional()
  @IsEnum(PaymentProviderCode)
  provider?: PaymentProviderCode;
}
