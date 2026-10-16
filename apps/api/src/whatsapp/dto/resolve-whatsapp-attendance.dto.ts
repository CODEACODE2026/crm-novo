import { Transform, type TransformFnParams } from 'class-transformer';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class ResolveWhatsAppAttendanceDto {
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @Transform(({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? value.trim() || undefined : (value as unknown),
  )
  @IsString()
  @MaxLength(4000)
  resolutionNote?: string;
}
