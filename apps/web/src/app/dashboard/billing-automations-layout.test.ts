import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const dashboardSource = readFileSync(join(currentDir, 'page.tsx'), 'utf8');
const stylesSource = readFileSync(join(currentDir, '../globals.css'), 'utf8');
const billingViewSource = dashboardSource.slice(
  dashboardSource.indexOf('function BillingView'),
  dashboardSource.indexOf('function BillingDispatchDetailModal'),
);

describe('billing and automations UI 2.0 presentation source', () => {
  it('renders the billing header, semantic KPIs, and compact toolbar', () => {
    expect(dashboardSource).toContain('title="Cobranças"');
    expect(dashboardSource).toContain(
      'description="Acompanhe os envios e a situação das cobranças dos clientes."',
    );
    expect(dashboardSource).toContain('const billingKpis = [');
    expect(dashboardSource).toContain("label: 'Ignoradas/Canceladas'");
    expect(dashboardSource).toContain('className="toolbar billing-toolbar"');
    expect(dashboardSource).toContain('placeholder="Buscar cliente/referência"');
    expect(dashboardSource).toContain('await reconcileBilling();');
    expect(stylesSource).toContain('.billing-toolbar');
  });

  it('keeps all four billing KPIs present and compact as a mobile 2x2 grid', () => {
    expect(billingViewSource).toContain("label: 'Agendadas'");
    expect(billingViewSource).toContain("label: 'Enviadas'");
    expect(billingViewSource).toContain("label: 'Falhas'");
    expect(billingViewSource).toContain("label: 'Ignoradas/Canceladas'");
    expect(stylesSource).toContain(".app-shell[data-active-view='billing'] .billing-kpis");
    expect(stylesSource).toContain('grid-template-columns: repeat(2, minmax(0, 1fr));');
    expect(stylesSource).toContain('.billing-kpis .metric-card');
    expect(stylesSource).toContain('.billing-kpis .stat-icon');
  });

  it('keeps billing mobile filters and primary actions compact without changing handlers', () => {
    expect(billingViewSource).toContain('placeholder="Buscar cliente/referência"');
    expect(billingViewSource).toContain('aria-label="Vencimento"');
    expect(billingViewSource).toContain('Todos os status');
    expect(billingViewSource).toContain('onClick={() => void loadBilling()}');
    expect(billingViewSource).toContain('onClick={() => void runReconcile()}');
    expect(billingViewSource).toContain("disabled={working === 'reconcile'}");
    expect(stylesSource).toContain(".app-shell[data-active-view='billing'] .billing-toolbar");
    expect(stylesSource).toContain(".billing-toolbar input[type='date']");
    expect(stylesSource).toContain('.billing-toolbar .secondary-button');
    expect(stylesSource).toContain('.billing-toolbar .primary-button');
  });

  it('keeps billing template administration out of the operational billing screen', () => {
    expect(dashboardSource).not.toContain('MENSAGEM DE COBRANÇA');
    expect(dashboardSource).not.toContain('Mensagem de cobrança</h2>');
    expect(dashboardSource).not.toContain('<p>{template.content}</p>');
  });

  it('keeps billing rows consolidated and aligned with semantic status pills', () => {
    expect(dashboardSource).toContain('billingDispatchReferenceLabel(dispatch)');
    expect(dashboardSource).toContain('billingDispatchAmountLabel(dispatch)');
    expect(dashboardSource).toContain('billingDispatchDueDateLabel(dispatch)');
    expect(dashboardSource).toContain('className="billing-amount-column"');
    expect(dashboardSource).toContain('className="finance-status-column">Status');
    expect(dashboardSource).toContain('className="finance-attempts-column">Tentativas');
    expect(dashboardSource).toContain('className="finance-actions-column">Ações');
    expect(dashboardSource).toContain('billingDispatchStatusTone');
    expect(stylesSource).toContain('.billing-amount-column');
    expect(stylesSource).toContain('text-align: right;');
  });

  it('renders billing rows as mobile cards while preserving desktop table data and actions', () => {
    expect(billingViewSource).toContain('className="table-wrap billing-table-wrap"');
    expect(billingViewSource).toContain('className="billing-table"');
    expect(billingViewSource).toContain('data-label="Cliente"');
    expect(billingViewSource).toContain('data-label="Referência/Referências"');
    expect(billingViewSource).toContain('data-label="Valor"');
    expect(billingViewSource).toContain('data-label="Vencimento"');
    expect(billingViewSource).toContain('data-label="Agendada"');
    expect(billingViewSource).toContain('data-label="Status"');
    expect(billingViewSource).toContain('messageDispatchOriginLabel(dispatch.origin)');
    expect(billingViewSource).toContain('dispatch.connection ?');
    expect(billingViewSource).toContain('label="Ver detalhes"');
    expect(billingViewSource).toContain('void runSendNow(dispatch);');
    expect(billingViewSource).toContain('PaginationControls');
    expect(stylesSource).toContain('.billing-table-wrap');
    expect(stylesSource).toContain('.billing-table thead');
    expect(stylesSource).toContain('.billing-table tbody tr');
    expect(stylesSource).toContain('grid-template-areas:');
    expect(stylesSource).toContain('.billing-mobile-origin');
    expect(stylesSource).toContain('.billing-table .finance-actions-column');
  });

  it('opens billing details in a central modal and preserves send-now handler', () => {
    expect(dashboardSource).toContain('function BillingDispatchDetailModal');
    expect(dashboardSource).toContain('Detalhes da cobrança');
    expect(dashboardSource).toContain('providerMessageId');
    expect(dashboardSource).toContain('Itens consolidados');
    expect(dashboardSource).toContain('if (!current) return null;');
    expect(dashboardSource).toContain('await sendBillingNow(dispatch.id);');
    expect(dashboardSource).toContain('Enviar agora');
    expect(dashboardSource).toContain(
      'className="modal dispatch-detail-modal billing-dispatch-modal"',
    );
  });

  it('keeps recovery out of the billing helper scope', () => {
    expect(dashboardSource).toContain('listBillingDispatches(filters)');
    expect(dashboardSource).not.toContain("origin: 'RECOVERY'");
    expect(dashboardSource).toContain("if (status === 'IGNORED') return 'muted'");
  });

  it('keeps billing automation operational while linking configuration to Settings', () => {
    expect(dashboardSource).toContain('Cobrança automática');
    expect(dashboardSource).toContain(
      'Acompanhe a operação da rotina de envio de lembretes de cobrança.',
    );
    expect(dashboardSource).toContain('Configurar automação');
    expect(dashboardSource).toContain('automation-billing-operation-grid');
    expect(dashboardSource).toContain('Envios agendados');
    expect(dashboardSource).toContain('Enviadas hoje');
    expect(dashboardSource).toContain('Falhas hoje');
    expect(dashboardSource).toContain('1 comunicação');
    expect(dashboardSource).toContain('por execução automática');
    expect(dashboardSource).toContain('Os envios dependem de uma conexão WhatsApp operacional.');
    expect(dashboardSource).toContain('Próximos envios');
    expect(dashboardSource).toContain('automation-schedule-table');
    expect(dashboardSource).toContain('setSelectedAutomationDispatch(dispatch)');
    expect(dashboardSource).not.toContain('void saveBillingSettings({ sendTime })');
    expect(dashboardSource).not.toContain(
      'void saveBillingSettings({ sendIntervalSeconds: parsed })',
    );
  });

  it('splits automations into local tabs and renders only the active panel', () => {
    expect(dashboardSource).toContain("type AutomationTab = 'billing' | 'recovery' | 'monitoring'");
    expect(dashboardSource).toContain("useState<AutomationTab>('billing')");
    expect(dashboardSource).toContain('role="tablist" aria-label="Automações"');
    expect(dashboardSource).toContain("automationTab === 'billing'");
    expect(dashboardSource).toContain("automationTab === 'recovery'");
    expect(dashboardSource).toContain("automationTab === 'monitoring'");
    expect(dashboardSource).toContain("{automationTab === 'billing' ? (");
    expect(dashboardSource).toContain("{automationTab === 'recovery' ? (");
    expect(dashboardSource).toContain("{automationTab === 'monitoring' ? (");
    expect(dashboardSource).toContain('Cobrança automática');
    expect(dashboardSource).toContain('Recuperação por inadimplência');
    expect(dashboardSource).toContain('Monitoramento');
    expect(stylesSource).toContain('.automation-tabs');
    expect(stylesSource).toContain('.automation-tab-panel');
  });

  it('keeps billing, recovery, and monitoring concerns separated visually', () => {
    expect(dashboardSource).toContain('automation-billing-section');
    expect(dashboardSource).toContain('recovery-section');
    expect(dashboardSource).toContain('Pendências operacionais');
    expect(dashboardSource).toContain('Campanhas de recuperação');
    expect(dashboardSource).toContain('Verificar ciclos');
    expect(dashboardSource).toContain('recovery-campaign-table');
    expect(dashboardSource).toContain('shortUuid(receivableId)');
    expect(dashboardSource).toContain('title={receivableId ?? undefined}');
    expect(stylesSource).toContain('.automation-billing-operation-grid');
    expect(stylesSource).toContain('.technical-id');
  });

  it('keeps template administration out of Automations and links to Settings templates', () => {
    expect(dashboardSource).toContain('title="Templates de mensagens"');
    expect(dashboardSource).toContain(
      'Resumo operacional dos templates usados pela cobrança automática.',
    );
    expect(dashboardSource).toContain('Gerenciar templates');
    expect(dashboardSource).toContain("onOpenBillingSettings('templates')");
    expect(dashboardSource).toContain('billingTemplates.length');
    expect(dashboardSource).toContain('activeBillingTemplates');
    expect(dashboardSource).not.toContain('Conteúdo da mensagem');
    expect(dashboardSource).not.toContain('editingBillingTemplate');
    expect(dashboardSource).not.toContain('openBillingTemplate');
    expect(dashboardSource).not.toContain('toggleBillingTemplate');
    expect(stylesSource).toContain('.automation-template-summary');
  });

  it('renders recovery settings, offsets, campaign rows, and campaign detail steps', () => {
    expect(dashboardSource).toContain('Recuperação por inadimplência');
    expect(dashboardSource).toContain('Acompanhamento automático de contas vencidas.');
    expect(dashboardSource).toContain('Configurar recuperação');
    expect(dashboardSource).toContain('Etapas de comunicação');
    expect(dashboardSource).toContain('Configurar em Settings');
    expect(dashboardSource).toContain('recovery-steps-timeline');
    expect(dashboardSource).toContain('D+{step.offsetDays}');
    expect(dashboardSource).toContain('Templates de recuperação');
    expect(dashboardSource).not.toContain('RecoveryAutomationPreviewModal');
    expect(dashboardSource).not.toContain('editingRecoveryTemplate');
    expect(dashboardSource).not.toContain('openRecoveryTemplate');
    expect(dashboardSource).not.toContain('toggleRecoveryTemplate');
    expect(dashboardSource).not.toContain('MENSAGENS POR ETAPA');
    expect(dashboardSource).not.toContain(
      "<p>{template?.content ?? 'Template da etapa indisponível.'}</p>",
    );
    expect(dashboardSource).toContain('Campanhas de recuperação');
    expect(dashboardSource).toContain('className="recovery-campaign-table"');
    expect(dashboardSource).toContain('setSelectedCampaign(campaign)');
    expect(dashboardSource).toContain('function RecoveryCampaignDetailModal');
    expect(dashboardSource).toContain('D+{step.delayDays}');
    expect(dashboardSource).toContain('recoveryStepStatusTone(step.status)');
    expect(dashboardSource).toContain('Etapa atual/próxima');
    expect(dashboardSource).toContain('Próxima data');
  });

  it('keeps responsive UI classes for desktop density and mobile stacking', () => {
    expect(stylesSource).toContain('.automation-summary-grid');
    expect(stylesSource).toContain('.recovery-steps-timeline');
    expect(stylesSource).toContain('.recovery-campaign-steps article');
    expect(stylesSource).toContain('.automation-schedule-table');
    expect(stylesSource).toContain('.recovery-campaign-table');
    expect(stylesSource).toContain('@media (max-width: 620px)');
    expect(stylesSource).toContain('.billing-toolbar,');
    expect(stylesSource).toContain('.recovery-toolbar,');
  });
});
