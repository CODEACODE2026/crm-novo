import { IsIn, IsOptional } from 'class-validator';

export class SetWhatsAppConversationPresenceDto {
  @IsIn(['composing', 'paused'])
  state!: 'composing' | 'paused';

  @IsOptional()
  @IsIn(['audio', null])
  media?: 'audio' | null;
}
