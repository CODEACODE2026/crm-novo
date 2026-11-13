import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class SendWhatsAppConversationMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body!: string;

  @IsOptional()
  @IsUUID()
  requestId?: string;

  @IsOptional()
  @IsUUID()
  replyToMessageId?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  continueOnPreparedSuccessor?: boolean = false;
}
