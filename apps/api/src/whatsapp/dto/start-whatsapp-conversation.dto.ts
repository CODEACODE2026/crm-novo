import { IsOptional, IsString, IsUUID, MaxLength, MinLength, ValidateIf } from 'class-validator';

export class StartWhatsAppConversationDto {
  @IsUUID()
  whatsAppConnectionId!: string;

  @IsOptional()
  @IsUUID()
  clientId?: string;

  @ValidateIf((dto: StartWhatsAppConversationDto) => !dto.clientId)
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  phone?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body!: string;

  @IsUUID()
  requestId!: string;
}
