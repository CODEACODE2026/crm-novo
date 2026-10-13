import { PartialType } from '@nestjs/mapped-types';
import { CreateWhatsAppQuickReplyDto } from './create-whatsapp-quick-reply.dto';

export class UpdateWhatsAppQuickReplyDto extends PartialType(CreateWhatsAppQuickReplyDto) {}
