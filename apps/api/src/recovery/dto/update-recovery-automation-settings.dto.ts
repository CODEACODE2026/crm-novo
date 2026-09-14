import { IsBoolean, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

export class UpdateRecoveryAutomationSettingsDto {
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

  @IsOptional()
  @IsBoolean()
  day3Enabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  day3OffsetDays?: number;

  @IsOptional()
  @IsBoolean()
  day10Enabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  day10OffsetDays?: number;

  @IsOptional()
  @IsBoolean()
  day15Enabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  day15OffsetDays?: number;

  @IsOptional()
  @IsBoolean()
  day30Enabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  day30OffsetDays?: number;
}
