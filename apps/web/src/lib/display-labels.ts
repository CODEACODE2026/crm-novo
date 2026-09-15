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

const messageTemplateTypeLabels: Record<string, string> = {
  INITIAL_ACTIVATION: 'Ativação inicial',
  BILLING_DUE: 'Cobrança padrão',
  RECOVERY_DAY_3: '3 dias após vencimento',
  RECOVERY_DAY_7: '7 dias após vencimento',
  RECOVERY_DAY_10: 'Template legado de recuperação',
  RECOVERY_DAY_15: '15 dias após vencimento',
  RECOVERY_DAY_30: '30 dias após vencimento',
};

const recoveryTemplateTypes = new Set([
  'RECOVERY_DAY_3',
  'RECOVERY_DAY_7',
  'RECOVERY_DAY_15',
  'RECOVERY_DAY_30',
]);

export const recoveryTemplateCards = [
  { title: '3 dias após vencimento', templateType: 'RECOVERY_DAY_3' },
  { title: '7 dias após vencimento', templateType: 'RECOVERY_DAY_7' },
  { title: '15 dias após vencimento', templateType: 'RECOVERY_DAY_15' },
  { title: '30 dias após vencimento', templateType: 'RECOVERY_DAY_30' },
] as const;

export function removalCountLabel(key: string) {
  return removalCountLabels[key] ?? 'Registro relacionado';
}

export function reportSummaryLabel(key: string) {
  return reportSummaryLabels[key] ?? 'Resumo adicional';
}

export function messageTemplateTypeLabel(type: string) {
  return messageTemplateTypeLabels[type] ?? 'Template';
}

export function billingMessageTemplates<T extends { type: string }>(templates: T[]) {
  return templates.filter((template) => template.type === 'BILLING_DUE');
}

export function recoveryMessageTemplates<T extends { type: string }>(templates: T[]) {
  return templates.filter((template) => recoveryTemplateTypes.has(template.type));
}
