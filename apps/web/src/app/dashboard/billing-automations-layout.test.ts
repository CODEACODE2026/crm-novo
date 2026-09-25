import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const dashboardSource = readFileSync(join(currentDir, 'page.tsx'), 'utf8');
const stylesSource = readFileSync(join(currentDir, '../globals.css'), 'utf8');

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

  it('moves billing automation messages to compact automation cards with safe previews', () => {
    expect(dashboardSource).toContain('title="Mensagens da automação"');
    expect(dashboardSource).toContain('Cobrança individual');
    expect(dashboardSource).toContain('Cobrança agrupada');
    expect(dashboardSource).toContain('Usada quando existe uma única cobrança para o cliente.');
    expect(dashboardSource).toContain(
      'Usada quando várias cobranças são consolidadas em uma única mensagem.',
    );
    expect(dashboardSource).toContain('Prévia da mensagem');
    expect(dashboardSource).toContain('Exemplo de visualização');
    expect(dashboardSource).toContain('Plano Mensal');
    expect(dashboardSource).toContain('teste01 — R$ 30,00 — vence 20/09/2026');
    expect(dashboardSource).toContain('Total: R$ 90,00');
    expect(dashboardSource).toContain('Conteúdo da mensagem');
    expect(dashboardSource).toContain(
      'editingBillingTemplate.variables.map((variable) => `{{${variable}}}`).join',
    );
    expect(dashboardSource).toContain("label: template.active ? 'Desativar' : 'Ativar'");
    expect(stylesSource).toContain('.automation-message-grid');
    expect(stylesSource).toContain('.automation-message-card');
    expect(stylesSource).toContain('.automation-preview-card');
  });

  it('renders recovery settings, offsets, campaign rows, and campaign detail steps', () => {
    expect(dashboardSource).toContain('Recuperação por inadimplência');
    expect(dashboardSource).toContain('Acompanhamento automático de contas vencidas.');
    expect(dashboardSource).toContain('Configurar recuperação');
    expect(dashboardSource).toContain('Etapas de comunicação');
    expect(dashboardSource).toContain('Configurar em Settings');
    expect(dashboardSource).toContain('recovery-steps-timeline');
    expect(dashboardSource).toContain('D+{step.offsetDays}');
    expect(dashboardSource).toContain('Mensagens de recuperação');
    expect(dashboardSource).toContain('RecoveryAutomationPreviewModal');
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
