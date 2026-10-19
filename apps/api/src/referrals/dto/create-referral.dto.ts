import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min, ValidateIf } from 'class-validator';
import { ReferralRewardType } from '@prisma/client';

export class CreateReferralDto {
  @IsUUID()
  referredClientId!: string;

  @IsUUID()
  referrerClientId!: string;

  @IsOptional()
  @IsEnum(ReferralRewardType)
  rewardType?: ReferralRewardType;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  rewardValue?: number;

  @ValidateIf((dto: CreateReferralDto) => dto.rewardDescription !== undefined)
  @IsString()
  rewardDescription?: string;
}
