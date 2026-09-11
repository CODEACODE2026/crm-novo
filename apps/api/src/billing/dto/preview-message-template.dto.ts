import { IsOptional, IsString } from 'class-validator';

export class PreviewMessageTemplateDto {
  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  value?: string;

  @IsOptional()
  @IsString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  plan?: string;

  @IsOptional()
  @IsString()
  reference?: string;
}
