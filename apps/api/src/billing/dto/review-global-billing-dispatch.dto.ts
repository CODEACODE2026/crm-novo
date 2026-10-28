import { IsISO8601, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { Transform, type TransformFnParams } from 'class-transformer';

export class ReviewGlobalBillingDispatchDto {
  @IsISO8601({ strict: true })
  @Matches(/(Z|[+-]\d{2}:\d{2})$/i, {
    message: 'scheduledFor deve conter timezone explicito.',
  })
  scheduledFor!: string;

  @Transform((params: TransformFnParams): unknown => {
    const value: unknown = params.value;
    return typeof value === 'string' ? value.trim() : value;
  })
  @IsString()
  @Matches(/\S/, { message: 'reason deve conter caracteres nao brancos.' })
  @MinLength(10)
  @MaxLength(500)
  reason!: string;
}
