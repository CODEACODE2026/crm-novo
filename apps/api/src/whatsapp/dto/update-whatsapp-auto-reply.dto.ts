import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { WhatsAppAutoReplyAudience, WhatsAppAutoReplyMode } from '@prisma/client';

export class UpdateWhatsAppAutoReplyDto {
  @IsBoolean()
  enabled!: boolean;

  @IsEnum(WhatsAppAutoReplyMode)
  mode!: WhatsAppAutoReplyMode;

  @IsString()
  @MaxLength(2000)
  message!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(43_200)
  cooldownMinutes!: number;

  @IsEnum(WhatsAppAutoReplyAudience)
  audience!: WhatsAppAutoReplyAudience;

  @IsOptional()
  @IsDateString()
  startsAt?: string | null;

  @IsOptional()
  @IsDateString()
  endsAt?: string | null;
}
