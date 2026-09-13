import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Min, ValidateIf } from 'class-validator';

export class ApplyReferralRewardDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  rewardValue?: number;

  @ValidateIf((dto: ApplyReferralRewardDto) => dto.rewardDescription !== undefined)
  @IsString()
  rewardDescription?: string;
}
