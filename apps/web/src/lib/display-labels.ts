const removalCountLabels: Record<string, string> = {
  total: 'Total de registros',
  clients: 'Clientes',
  clientReferences: 'Referências do cliente',
  receivables: 'Contas a receber',
  renewals: 'Renovações',
  paymentIntents: 'Intenções de pagamento',
  paymentWebhookEvents: 'Eventos de pagamento',
  recoveryCampaigns: 'Campanhas de recuperação',
  recoveryCampaignSteps: 'Etapas de recuperação',
  messageDispatches: 'Mensagens de cobrança',
  billingResponses: 'Respostas de cobrança',
  financialTransactions: 'Transações financeiras',
  statusHistory: 'Histórico de status',
  clientEvents: 'Histórico do cliente',
  referrals: 'Indicações',
  referralsReceived: 'Indicações recebidas',
  referralsMade: 'Indicações feitas',
  referralsUpdated: 'Indicações atualizadas',
  whatsappPendingContacts: 'Contatos aguardando aprovação',
  whatsappInboundMessages: 'Mensagens recebidas no WhatsApp',
};

const reportSummaryLabels: Record<string, string> = {
  amount: 'Valor total',
  entries: 'Entradas',
  expenses: 'Saídas',
  balance: 'Saldo',
  byStatus: 'Status',
  byPlan: 'Planos',
};

export function removalCountLabel(key: string) {
  return removalCountLabels[key] ?? 'Registro relacionado';
}

export function reportSummaryLabel(key: string) {
  return reportSummaryLabels[key] ?? 'Resumo adicional';
}
