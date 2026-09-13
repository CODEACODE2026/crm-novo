import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min, ValidateIf } from 'class-validator';
import { ReferralRewardType } from '@prisma/client';

export class CreateReferralInputDto {
  @IsOptional()
  @IsUUID()
  referrerClientId?: string;

  @IsOptional()
  @IsEnum(ReferralRewardType)
  rewardType?: ReferralRewardType;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  rewardValue?: number;

  @ValidateIf((dto: CreateReferralInputDto) => dto.rewardType === 'CUSTOM')
  @IsString()
  rewardDescription?: string;
}
