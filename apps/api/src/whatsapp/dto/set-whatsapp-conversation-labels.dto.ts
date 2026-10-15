import { ArrayMaxSize, IsArray, IsUUID } from 'class-validator';

export class SetWhatsAppConversationLabelsDto {
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  labelIds!: string[];
}
