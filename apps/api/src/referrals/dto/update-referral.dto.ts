import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateIf,
} from 'class-validator';
import { ReferralRewardType } from '@prisma/client';

export class UpdateReferralDto {
  @IsUUID()
  referrerClientId!: string;

  @IsEnum(ReferralRewardType)
  rewardType!: ReferralRewardType;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  rewardValue?: number | null;

  @ValidateIf((dto: UpdateReferralDto) => dto.rewardDescription !== undefined)
  @IsOptional()
  @IsString()
  rewardDescription?: string | null;

  @IsDateString()
  expectedUpdatedAt!: string;
}
