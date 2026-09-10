import { FinancialTransactionType } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateFinancialCategoryDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsEnum(FinancialTransactionType)
  type!: FinancialTransactionType;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
