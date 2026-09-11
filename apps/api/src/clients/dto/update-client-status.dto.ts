import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { ClientStatus } from '@prisma/client';

export class UpdateClientStatusDto {
  @IsEnum(ClientStatus)
  status!: ClientStatus;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsBoolean()
  startRecovery?: boolean;
}
