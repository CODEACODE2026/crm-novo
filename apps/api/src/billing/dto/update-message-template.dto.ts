import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateMessageTemplateDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  content?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
