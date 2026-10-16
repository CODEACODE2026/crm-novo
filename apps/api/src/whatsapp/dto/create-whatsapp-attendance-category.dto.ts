import { WhatsAppConversationLabelColor } from '@prisma/client';
import { Transform, Type, type TransformFnParams } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class CreateWhatsAppAttendanceCategoryDto {
  @Transform(({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? value.trim() : (value as unknown),
  )
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @IsEnum(WhatsAppConversationLabelColor)
  color!: WhatsAppConversationLabelColor;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
