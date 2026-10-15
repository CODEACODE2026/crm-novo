import { IsUUID } from 'class-validator';

export class ForwardWhatsAppConversationMessageDto {
  @IsUUID()
  targetConversationId!: string;

  @IsUUID()
  requestId!: string;
}
