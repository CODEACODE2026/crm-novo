import { IsBoolean } from 'class-validator';

export class UpdatePlanActiveDto {
  @IsBoolean()
  active!: boolean;
}
