import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class SendWhatsAppSavedStickerDto {
  @IsString()
  @MaxLength(120)
  requestId!: string;

  @IsOptional()
  @IsUUID()
  replyToMessageId?: string;
}
