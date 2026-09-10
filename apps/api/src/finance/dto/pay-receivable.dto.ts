import { IsOptional, IsString, IsUUID } from 'class-validator';

export class PayReceivableDto {
  @IsString()
  paymentDate!: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
