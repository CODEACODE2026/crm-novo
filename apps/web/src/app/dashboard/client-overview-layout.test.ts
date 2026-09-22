import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const dashboardSource = readFileSync(join(currentDir, 'page.tsx'), 'utf8');
const stylesSource = readFileSync(join(currentDir, '../globals.css'), 'utf8');
const clientMoreSource = dashboardSource.slice(
  dashboardSource.indexOf('className="client-tab-panel client-more-workspace"'),
  dashboardSource.indexOf("{detailTab === 'receivables' ? ("),
);
const renewalReversalModalSource = dashboardSource.slice(
  dashboardSource.indexOf('function RenewalReversalModal'),
  dashboardSource.indexOf('function renewalReversalImpactMessages'),
);

describe('client overview presentation source', () => {
  it('scopes the compact wide modal treatment to new client creation', () => {
    expect(dashboardSource).toContain('client-create-modal');
    expect(dashboardSource).toContain('onCancel={onCloseForm}');
    expect(stylesSource).toContain('.client-create-modal');
    expect(stylesSource).toContain('width: min(960px, calc(100vw - 36px));');
    expect(stylesSource).toContain('.client-create-modal .client-form-body');
    expect(stylesSource).toContain('grid-template-columns: minmax(0, 1fr) minmax(300px, 0.9fr);');
    expect(stylesSource).toContain('.client-create-modal .client-form-actions');
  });

  it('uses compact profile rows instead of the old large readonly field blocks', () => {
    expect(dashboardSource).toContain('client-info-grid');
    expect(dashboardSource).toContain('client-info-item');
    expect(dashboardSource).not.toContain('className="detail-list client-profile-list"');
    expect(dashboardSource).not.toContain('client-profile-list');
    expect(stylesSource).not.toContain('.client-profile-list');
  });

  it('shows missing email and notes with explicit muted copy', () => {
    expect(dashboardSource).toContain("value: selectedClient.email ?? 'Não informado'");
    expect(dashboardSource).toContain("{selectedClient.notes ?? 'Nenhuma observação cadastrada.'}");
    expect(stylesSource).toContain('.muted-value');
  });

  it('renders the operational summary with existing frontend metrics and no global client status', () => {
    expect(dashboardSource).toContain('Resumo operacional');
    expect(dashboardSource).toContain('Situação atual do cliente');
    expect(dashboardSource).toContain('<ClientSectionHeading');
    expect(dashboardSource).toContain('client-summary-status-row');
    expect(dashboardSource).not.toMatch(
      /<StatusBadge\s+status=\{uniqueSelectedReference\?\.status \?\? selectedClient\.status\}\s+\/>/,
    );
    expect(dashboardSource).toContain('referenceCounts.active');
    expect(dashboardSource).toContain("clientOverviewAmount('pendingAmount')");
    expect(dashboardSource).toContain("clientOverviewAmount('paidAmount')");
    expect(dashboardSource).toContain('getReceivablesSummary({ clientId: selectedClientId })');
    expect(dashboardSource).toContain('clientNextDueSummary(selectedReferences)');
    expect(stylesSource).toContain('.client-summary-metrics');
    expect(stylesSource).toContain('.metric-value-primary');
    expect(stylesSource).toContain('.metric-value-success');
    expect(stylesSource).toContain('.metric-value-info');
  });

  it('does not render the legacy aggregated client status in the detail header', () => {
    expect(dashboardSource).toContain('<h2>{selectedClient.name}</h2>');
    expect(dashboardSource).toContain(
      '<span>{clientReferenceCountLabel(selectedReferences.length)}</span>',
    );
    expect(dashboardSource).toContain('<span>WhatsApp: {selectedClient.phoneNormalized}</span>');
    expect(dashboardSource).toContain(
      '<span>Cliente desde {formatDate(selectedClient.createdAt)}</span>',
    );
    expect(dashboardSource).not.toMatch(
      /<StatusBadge\s+status=\{uniqueSelectedReference\?\.status \?\? selectedClient\.status\}\s+\/>/,
    );
  });

  it('keeps reference and receivable statuses bound to their operational sources', () => {
    expect(dashboardSource).toContain('<StatusBadge status={reference.status} />');
    expect(dashboardSource).toContain('{receivable.displayStatus}');
    expect(dashboardSource).toContain("receivable.status === 'PENDENTE'");
  });

  it('uses a shared overview section heading primitive with fixed icon geometry', () => {
    expect(dashboardSource).toContain('function ClientSectionHeading');
    expect(dashboardSource).toContain('client-overview-heading-copy');
    expect(dashboardSource).toContain('client-overview-heading-action');
    expect((dashboardSource.match(/<ClientSectionHeading/g) ?? []).length).toBeGreaterThanOrEqual(
      3,
    );
    expect(stylesSource).toContain('.client-overview-heading .section-icon');
    expect(stylesSource).toContain('flex: 0 0 32px;');
    expect(stylesSource).toContain('width: 32px;');
    expect(stylesSource).toContain('height: 32px;');
    expect(stylesSource).toContain('.client-overview-heading .section-icon svg');
    expect(stylesSource).toContain('width: 16px;');
    expect(stylesSource).toContain('height: 16px;');
  });

  it('renders the client list situation from reference status summaries', () => {
    expect(dashboardSource).toContain('<th>SITUAÇÃO</th>');
    expect(dashboardSource).toContain('items={clientReferenceStatusSummary(client)}');
    expect(dashboardSource).toContain('Situação baseada nas referências do cliente.');
    expect(stylesSource).toContain('.reference-status-summary');
    expect(stylesSource).toContain('.reference-status-item.tone-success');
    expect(stylesSource).toContain('.reference-status-item.tone-warning');
    expect(stylesSource).toContain('.reference-status-item.tone-info');
    expect(stylesSource).toContain('.reference-status-item.tone-danger');
    expect(dashboardSource).not.toContain('clientDisplayStatus(client)');
  });

  it('limits overview activity to five events and links to the full history tab', () => {
    expect(dashboardSource).toContain('(selectedClient.events ?? []).slice(0, 5)');
    expect(dashboardSource).toContain('Ver histórico completo');
    expect(dashboardSource).toContain("onClick={() => setDetailTab('timeline')}");
    expect(dashboardSource).toContain('Nenhuma atividade recente.');
  });

  it('keeps timeline icon wrappers centered without generic span overrides', () => {
    expect(stylesSource).toContain('flex: 0 0 28px;');
    expect(stylesSource).toContain('.client-timeline-icon svg,');
    expect(stylesSource).toContain('position: static;');
    expect(stylesSource).toContain('transform: none;');
    expect(stylesSource).toContain('.timeline li > div > span,');
    expect(stylesSource).not.toContain('.timeline span,');
  });

  it('centers finance and billing status/actions with dedicated table columns', () => {
    expect(dashboardSource).toContain('className="finance-status-column">Situação');
    expect(dashboardSource).toContain('className="finance-status-column">Status');
    expect(dashboardSource).toContain('<td className="finance-status-column">');
    expect(dashboardSource).toContain('className="finance-actions-column">Ações');
    expect(dashboardSource).toContain('<td className="finance-actions-column">');
    expect(dashboardSource).toContain('className="finance-select-column"');
    expect(dashboardSource).toContain('className="finance-amount-column"');
    expect(stylesSource).toContain('.finance-status-column');
    expect(stylesSource).toContain('text-align: center;');
    expect(stylesSource).toContain('justify-content: center;');
    expect(stylesSource).toContain('min-width: 76px;');
    expect(stylesSource).toContain('vertical-align: middle;');
  });

  it('loads the Cobranças/PIX tab from billing endpoints without embedded client dispatches', () => {
    expect(dashboardSource).toContain("if (!selectedClientId || detailTab !== 'messages') return;");
    expect(dashboardSource).toContain('void loadClientPixSummary();');
    expect(dashboardSource).toContain('void loadClientBillingDispatches();');
    expect(dashboardSource).toContain('void loadClientBillingSummary();');
    expect(dashboardSource).toContain('const loadClientBillingDispatches = useCallback(');
    expect(dashboardSource).toContain('const loadClientBillingSummary = useCallback(async () => {');
    expect(dashboardSource).toContain('listBillingDispatches(filters)');
    expect(dashboardSource).toContain('getBillingDispatchSummary(baseFilters)');
    expect(dashboardSource).toContain('clientBillingDispatches.map((dispatch)');
    expect(dashboardSource).not.toContain('selectedClient?.messageDispatches ?? []');
    expect(dashboardSource).toContain('getPaymentIntentsSummary({ clientId: selectedClientId })');
    expect(dashboardSource).toContain('clientPixSummaryError');
    expect(dashboardSource).toContain('clientPixSummary.summary.total');
    expect(dashboardSource).toContain('selectedClient.recoveryCampaigns ?? []');
  });

  it('polishes the client Mais tab without repeated Mais section eyebrows', () => {
    expect(clientMoreSource).toContain('client-more-workspace');
    expect(clientMoreSource).not.toContain('eyebrow="Mais"');
    expect(clientMoreSource).not.toContain('<SectionHeader');
    expect(clientMoreSource).toContain('title="Renovações"');
    expect(clientMoreSource).toContain('title="Recuperação"');
    expect(clientMoreSource).toContain('title="Indicações"');
    expect(clientMoreSource).toContain('Histórico de renovações deste cliente.');
    expect(clientMoreSource).toContain('Acompanhamento de campanhas de inadimplência.');
    expect(clientMoreSource).toContain('Indicações recebidas e realizadas pelo cliente.');
    expect(stylesSource).toContain('.client-more-workspace');
    expect(stylesSource).toContain('.client-more-card');
  });

  it('renders compact empty states for client renewals and recovery', () => {
    expect(clientMoreSource).toContain('Nenhuma renovação registrada');
    expect(clientMoreSource).toContain('As renovações deste cliente aparecerão aqui.');
    expect(clientMoreSource).toContain('Nenhuma campanha de recuperação');
    expect(clientMoreSource).toContain('Este cliente não possui campanha de recuperação ativa.');
    expect(clientMoreSource).toContain('<RefreshCw aria-hidden="true" size={18} />');
    expect(clientMoreSource).toContain('<Activity aria-hidden="true" size={18} />');
    expect(stylesSource).toContain('.client-more-empty');
    expect(stylesSource).toContain('height: auto;');
  });

  it('keeps renewal and recovery cards bound to existing client payload fields only', () => {
    expect(clientMoreSource).toContain('(selectedClient.renewals ?? []).map((renewal)');
    expect(clientMoreSource).toContain('renewal.planName');
    expect(clientMoreSource).toContain('renewal.amount');
    expect(clientMoreSource).toContain('renewal.previousDueDate');
    expect(clientMoreSource).toContain('renewal.newDueDate');
    expect(clientMoreSource).toContain('(selectedClient.recoveryCampaigns ?? []).map((campaign)');
    expect(clientMoreSource).toContain('campaign.status');
    expect(clientMoreSource).toContain('campaign.startedAt');
    expect(clientMoreSource).toContain('campaign.steps.map((step)');
    expect(clientMoreSource).toContain('step.delayDays');
    expect(clientMoreSource).toContain('step.scheduledFor');
    expect(clientMoreSource).toContain('step.sentAt');
  });

  it('adds renewal reversal as a contextual preview-first action', () => {
    expect(dashboardSource).toContain(
      'previewRenewalReversal(renewal.clientReferenceId, renewal.id)',
    );
    expect(dashboardSource).toContain('confirmRenewalReversal(');
    expect(clientMoreSource).toContain('Desfazer renovação');
    expect(clientMoreSource).toContain("renewal.status !== 'REVERTED'");
    expect(clientMoreSource).toContain('Carregando prévia');
    expect(clientMoreSource).toContain('Revertida');
    expect(dashboardSource).toContain('function RenewalReversalModal');
    expect(dashboardSource).toContain(
      'Revise o estado que será restaurado e os impactos antes de confirmar.',
    );
    expect(dashboardSource).toContain('Impactos da reversão');
    expect(dashboardSource).toContain('Esta renovação não pode ser desfeita.');
    expect(dashboardSource).toContain('LEGACY_RENEWAL');
    expect(dashboardSource).toContain('Renovação antiga sem dados suficientes');
    expect(dashboardSource).toContain('RECEIVABLE_PAID');
    expect(dashboardSource).toContain('A cobrança desta renovação já foi paga.');
    expect(dashboardSource).toContain('PIX_ACTIVE');
    expect(dashboardSource).toContain(
      'Existe PIX aguardando pagamento. Cancele-o antes de desfazer.',
    );
    expect(dashboardSource).toContain('SENT_BILLING_WILL_BE_PRESERVED');
    expect(dashboardSource).toContain(
      'Existem cobranças que já foram enviadas e permanecerão no histórico.',
    );
    expect(dashboardSource).toContain('Motivo da reversão *');
    expect(dashboardSource).toContain('trimmedReason.length >= 3');
    expect(dashboardSource).toContain(
      'const [idempotencyKey] = useState(() => crypto.randomUUID())',
    );
    expect(dashboardSource).toContain('const savingRef = useRef(false)');
    expect(dashboardSource).toContain('if (!canConfirm || savingRef.current) return;');
    expect(dashboardSource).toContain('savingRef.current = true;');
    expect(dashboardSource).toContain('savingRef.current = false;');
    expect(dashboardSource).toContain('disabled={saving || !canConfirm}');
    expect(dashboardSource).toContain('await onConfirm({ reason: trimmedReason, idempotencyKey })');
    expect(renewalReversalModalSource).toContain('maxLength={500}');
    expect(renewalReversalModalSource).toContain('minLength={3}');
    expect(renewalReversalModalSource).toContain('{trimmedReason.length}/500 caracteres');
    expect(renewalReversalModalSource).not.toContain('<form');
    expect(dashboardSource).toContain('mappedWarnings[warning.code] ?? warning.message');
    expect(dashboardSource).toContain('mappedBlockers[blocker.code] ?? blocker.message');
    expect(dashboardSource).toContain('idempotentReplay');
    expect(dashboardSource).toContain('Renovação desfeita com sucesso.');
    expect(dashboardSource).not.toContain('latestRenewal');
    expect(stylesSource).toContain('.renewal-reversal-modal');
    expect(stylesSource).toContain('.renewal-reversal-summary');
  });

  it('separates received and made referrals with read-only mini KPIs and compact lists', () => {
    expect(clientMoreSource).toContain('Indicação recebida');
    expect(clientMoreSource).toContain('Indicações feitas');
    expect(clientMoreSource).toContain('selectedClient.referralReceived.referrerClient.name');
    expect(clientMoreSource).toContain('referralBenefitLabel(selectedClient.referralReceived)');
    expect(clientMoreSource).toContain(
      'referralStatusLabel(selectedClient.referralReceived.status)',
    );
    expect(clientMoreSource).toContain('selectedClient.referralsMade?.total ?? 0');
    expect(clientMoreSource).toContain('selectedClient.referralsMade?.qualified ?? 0');
    expect(clientMoreSource).toContain('selectedClient.referralsMade?.rewarded ?? 0');
    expect(clientMoreSource).toContain('(selectedClient.referralsMade?.items ?? []).map');
    expect(clientMoreSource).toContain('referral.referredClient.name');
    expect(clientMoreSource).toContain('referralStatusLabel(referral.status)');
    expect(clientMoreSource).toContain('Este cliente não possui indicação recebida.');
    expect(clientMoreSource).toContain('Nenhuma indicação realizada.');
    expect(stylesSource).toContain('.client-referral-summary');
    expect(stylesSource).toContain('.client-referral-card');
  });

  it('uses referral status and benefit labels without adding client referral actions', () => {
    expect(dashboardSource).toContain("PENDING: 'Pendente'");
    expect(dashboardSource).toContain("QUALIFIED: 'Qualificada'");
    expect(dashboardSource).toContain("REWARDED: 'Benefício aplicado'");
    expect(dashboardSource).toContain("CANCELED: 'Cancelada'");
    expect(dashboardSource).toContain("FREE_MONTH: 'Mês grátis'");
    expect(dashboardSource).toContain("CREDIT: 'Crédito'");
    expect(dashboardSource).toContain("CUSTOM: 'Personalizado'");
    expect(clientMoreSource).not.toContain('applyReferralReward');
    expect(clientMoreSource).not.toContain('cancelReferral');
    expect(clientMoreSource).not.toContain('Aplicar benefício');
    expect(clientMoreSource).not.toContain('Cancelar indicação');
    expect(clientMoreSource).not.toContain('Nova indicação');
  });

  it('keeps the client Mais tab structurally ready for mobile', () => {
    expect(stylesSource).toContain('.client-more-list-item > div,');
    expect(stylesSource).toContain('.client-recovery-card header,');
    expect(stylesSource).toContain('.client-referral-card,');
    expect(stylesSource).toContain('.client-more-list-item dl,');
    expect(stylesSource).toContain('.client-more-meta-grid');
    expect(stylesSource).toContain('@media (max-width: 620px)');
  });
});
