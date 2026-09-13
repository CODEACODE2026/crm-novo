import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class ListReceivablesDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;

  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsUUID()
  clientReferenceId?: string;

  @IsOptional()
  @IsIn(['PENDENTE', 'PAGO', 'CANCELADO', 'VENCIDO'])
  status?: 'PENDENTE' | 'PAGO' | 'CANCELADO' | 'VENCIDO';

  @IsOptional()
  @IsString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsString()
  search?: string;
}
