import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import {
  ClientStatus,
  FinancialTransactionOrigin,
  FinancialTransactionType,
  MessageDispatchStatus,
  ReceivableStatus,
  RecoveryCampaignStatus,
  ReferralStatus,
} from '@prisma/client';

export class ListReportDto {
  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(ClientStatus)
  clientStatus?: ClientStatus;

  @IsOptional()
  @IsUUID()
  planId?: string;

  @IsOptional()
  @IsEnum(ReceivableStatus)
  receivableStatus?: ReceivableStatus;

  @IsOptional()
  @IsString()
  receivableDisplayStatus?: 'PENDENTE' | 'PAGO' | 'CANCELADO' | 'VENCIDO';

  @IsOptional()
  @IsEnum(FinancialTransactionType)
  transactionType?: FinancialTransactionType;

  @IsOptional()
  @IsEnum(FinancialTransactionOrigin)
  transactionOrigin?: FinancialTransactionOrigin;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsEnum(MessageDispatchStatus)
  dispatchStatus?: MessageDispatchStatus;

  @IsOptional()
  @IsEnum(RecoveryCampaignStatus)
  recoveryStatus?: RecoveryCampaignStatus;

  @IsOptional()
  @IsEnum(ReferralStatus)
  referralStatus?: ReferralStatus;

  @IsOptional()
  @IsUUID()
  referrerClientId?: string;
}
