import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class PayReceivableDto {
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
