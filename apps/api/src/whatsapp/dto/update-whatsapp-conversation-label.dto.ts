import { Transform, type TransformFnParams } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { WhatsAppConversationLabelColor } from '@prisma/client';

export class UpdateWhatsAppConversationLabelDto {
  @IsOptional()
  @Transform(({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? value.trim() : (value as unknown),
  )
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  name?: string;

  @IsOptional()
  @IsEnum(WhatsAppConversationLabelColor)
  color?: WhatsAppConversationLabelColor;
}
