import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

export class RevertRenewalDto {
  @Transform(({ value }: { value: unknown }) => trimString(value))
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;

  @Transform(({ value }: { value: unknown }) => trimString(value))
  @IsString()
  @MinLength(12)
  @MaxLength(120)
  idempotencyKey!: string;
}
