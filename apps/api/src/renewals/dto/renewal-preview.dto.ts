import { Type } from 'class-transformer';
import { IsNumber, IsUUID, Min } from 'class-validator';

export class RenewalPreviewDto {
  @IsUUID()
  planId!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount!: number;
}
