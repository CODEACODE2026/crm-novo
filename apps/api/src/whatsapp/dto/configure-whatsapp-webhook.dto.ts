import { IsArray, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class ConfigureWhatsAppWebhookDto {
  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(300)
  webhookUrl?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  events?: string[];
}
