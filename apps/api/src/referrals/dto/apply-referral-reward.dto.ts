import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, IsUUID, Min, ValidateIf } from 'class-validator';

export class ApplyReferralRewardDto {
  @IsOptional()
  @IsUUID()
  clientReferenceId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  rewardValue?: number;

  @ValidateIf((dto: ApplyReferralRewardDto) => dto.rewardDescription !== undefined)
  @IsString()
  rewardDescription?: string;
}
