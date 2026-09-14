import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ClientStatus } from '@prisma/client';

export class UpdateClientReferenceStatusDto {
  @IsEnum(ClientStatus)
  status!: ClientStatus;

  @IsOptional()
  @IsString()
  reason?: string;
}
