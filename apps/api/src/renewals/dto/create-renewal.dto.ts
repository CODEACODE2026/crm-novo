import { IsString, MinLength } from 'class-validator';
import { RenewalPreviewDto } from './renewal-preview.dto';

export class CreateRenewalDto extends RenewalPreviewDto {
  @IsString()
  @MinLength(12)
  idempotencyKey!: string;
}
