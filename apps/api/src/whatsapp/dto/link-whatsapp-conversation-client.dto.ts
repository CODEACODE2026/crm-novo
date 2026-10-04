import { IsUUID } from 'class-validator';

export class LinkWhatsAppConversationClientDto {
  @IsUUID()
  clientId!: string;
}
