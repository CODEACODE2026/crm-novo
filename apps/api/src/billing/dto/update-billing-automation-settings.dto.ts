import { IsBoolean, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

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

  @IsOptional()
  @IsInt()
  @Min(3)
  @Max(300)
  sendIntervalSeconds?: number;
}
