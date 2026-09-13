import { IsBoolean, IsOptional, IsString, Matches } from 'class-validator';

export class UpdateBillingAutomationSettingsDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  sendTime?: string;

  @IsOptional()
  @IsString()
  @Matches(/^America\/Sao_Paulo$/)
  timezone?: string;
}
