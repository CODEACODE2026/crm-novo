import { IsOptional, IsString, MaxLength } from 'class-validator';

export class IgnoreWhatsAppPendingContactDto {
  @IsOptional()
  @IsString()
  @MaxLength(240)
  reason?: string;
}
