import { ArrayNotEmpty, IsArray, IsOptional, IsString, IsUUID } from 'class-validator';

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
  notes?: string;
}
