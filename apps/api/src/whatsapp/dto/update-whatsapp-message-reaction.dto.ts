import { IsIn, IsOptional } from 'class-validator';

export const allowedWhatsAppReactionEmojis = ['👍', '❤️', '😂', '😮', '😢', '🙏'] as const;
export type AllowedWhatsAppReactionEmoji = (typeof allowedWhatsAppReactionEmojis)[number];

export class UpdateWhatsAppMessageReactionDto {
  @IsOptional()
  @IsIn(allowedWhatsAppReactionEmojis)
  emoji?: AllowedWhatsAppReactionEmoji | null;
}
