import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';

export class ApproveWhatsAppPendingContactDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsString()
  @MinLength(2)
  reference!: string;

  @IsUUID()
  planId!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  recurringValue!: number;

  @IsString()
  dueDate!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  billingNoticeDays!: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  generateInitialReceivable?: boolean;

  @IsOptional()
  @IsBoolean()
  sendPixWhatsAppNow?: boolean;
}
