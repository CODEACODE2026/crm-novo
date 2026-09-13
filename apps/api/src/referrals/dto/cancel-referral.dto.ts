import { IsString, MinLength } from 'class-validator';

export class CancelReferralDto {
  @IsString()
  @MinLength(3)
  reason!: string;
}
