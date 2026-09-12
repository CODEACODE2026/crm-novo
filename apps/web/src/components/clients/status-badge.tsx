import type { ClientStatus } from '../../lib/crm-api';

const statusLabels: Record<ClientStatus, string> = {
  PENDENTE_PAGAMENTO: 'Pendente pagamento',
  ATIVO: 'Ativo',
  INATIVO: 'Inativo',
  CANCELADO: 'Cancelado',
};

export function StatusBadge({ status }: { status: ClientStatus }) {
  return (
    <span className={`status-badge status-${status.toLowerCase()}`}>{statusLabels[status]}</span>
  );
}
