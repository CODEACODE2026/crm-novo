import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export enum ManualChargePayerType {
  REGISTERED_CLIENT = 'REGISTERED_CLIENT',
  GUEST = 'GUEST',
}

export class CreateManualChargeDto {
  @IsString()
  @MinLength(3)
  description!: string;

  @IsUUID()
  categoryId!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @IsString()
  dueDate!: string;

  @IsEnum(ManualChargePayerType)
  payerType!: ManualChargePayerType;

  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  payerName?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(32)
  payerPhone?: string;

  @IsString()
  @MinLength(8)
  @MaxLength(120)
  idempotencyKey!: string;
}
