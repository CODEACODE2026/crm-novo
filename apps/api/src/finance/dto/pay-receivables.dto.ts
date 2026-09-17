import { ArrayNotEmpty, IsArray, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class PayReceivablesDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  receivableIds!: string[];

  @IsString()
  paymentDate!: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
