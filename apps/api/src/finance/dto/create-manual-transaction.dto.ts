import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, IsUUID, Min, MinLength } from 'class-validator';

export class CreateManualTransactionDto {
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
  transactionDate!: string;

  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsUUID()
  clientReferenceId?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
