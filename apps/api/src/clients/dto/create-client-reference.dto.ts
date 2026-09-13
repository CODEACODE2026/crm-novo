import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsString, IsUUID, Min, MinLength } from 'class-validator';

export class CreateClientReferenceDto {
  @IsString()
  @MinLength(2)
  reference!: string;

  @IsUUID()
  planId!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  recurringValue!: number;

  @IsString()
  dueDate!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  billingNoticeDays!: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
