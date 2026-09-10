import { ReceivableStatus } from '@prisma/client';
import { formatBusinessDate, parseBusinessDate } from '../clients/utils/business-date';

export function buildRenewalReceivableDescription(planName: string) {
  return `Renovacao - Plano ${planName}`;
}

export function getReceivableDisplayStatus(
  status: ReceivableStatus,
  dueDate: Date,
  now = new Date(),
) {
  if (
    status === 'PENDENTE' &&
    parseBusinessDate(formatBusinessDate(dueDate)).getTime() <
      parseBusinessDate(formatBusinessDate(now)).getTime()
  ) {
    return 'VENCIDO';
  }

  return status;
}
