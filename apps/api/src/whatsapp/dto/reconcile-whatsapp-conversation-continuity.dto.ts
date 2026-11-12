import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class ReconcileWhatsAppConversationContinuityDto {
  @IsUUID()
  successorConnectionId!: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  apply?: boolean = false;
}
