import { FinancialTransactionType } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export const financialCategoryNameMaxLength = 120;

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateFinancialCategoryDto {
  @Transform(({ value }: { value: unknown }) => trimString(value))
  @IsString({ message: 'Informe o nome da categoria.' })
  @MinLength(2, { message: 'Informe o nome da categoria.' })
  @MaxLength(financialCategoryNameMaxLength, { message: 'Nome da categoria muito longo.' })
  name!: string;

  @IsEnum(FinancialTransactionType, { message: 'Tipo de categoria invalido.' })
  type!: FinancialTransactionType;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
