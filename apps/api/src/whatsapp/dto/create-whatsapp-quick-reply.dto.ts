import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const whatsappQuickReplyLabelMaxLength = 80;
export const whatsappQuickReplyTextMaxLength = 2000;

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateWhatsAppQuickReplyDto {
  @Transform(({ value }: { value: unknown }) => trimString(value))
  @IsString()
  @MinLength(1)
  @MaxLength(whatsappQuickReplyLabelMaxLength)
  label!: string;

  @Transform(({ value }: { value: unknown }) => trimString(value))
  @IsString()
  @MinLength(1)
  @MaxLength(whatsappQuickReplyTextMaxLength)
  text!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100000)
  sortOrder?: number;
}
