import { IsUUID } from 'class-validator';

export class PaymentIntentsSummaryDto {
  @IsUUID()
  clientId!: string;
}
