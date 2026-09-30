import { Type } from 'class-transformer';
import { IsNumber, IsString, IsUUID, Min, MinLength } from 'class-validator';

export class CreateReferenceReactivationDto {
  @IsUUID()
  planId!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @IsString()
  activationDate!: string;

  @IsString()
  @MinLength(12)
  idempotencyKey!: string;
}
