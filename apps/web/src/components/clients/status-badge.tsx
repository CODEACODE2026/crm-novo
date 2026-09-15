import type { ClientStatus } from '../../lib/crm-api';

const statusLabels: Record<ClientStatus, string> = {
  PENDENTE_PAGAMENTO: 'PENDENTE',
  ATIVO: 'ATIVO',
  INATIVO: 'INATIVO',
  CANCELADO: 'CANCELADO',
};

export function StatusBadge({ status }: { status: ClientStatus }) {
  return (
    <span className={`status-badge status-${status.toLowerCase()}`}>{statusLabels[status]}</span>
  );
}
