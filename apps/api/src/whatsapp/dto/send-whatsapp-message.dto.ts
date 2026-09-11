import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class SendWhatsAppMessageDto {
  @IsUUID()
  clientId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  requestId?: string;
}
