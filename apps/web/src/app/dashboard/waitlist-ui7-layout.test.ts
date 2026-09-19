import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const dashboardSource = readFileSync(join(currentDir, 'page.tsx'), 'utf8');
const stylesSource = readFileSync(join(currentDir, '../globals.css'), 'utf8');
const waitlistViewSource = dashboardSource.slice(
  dashboardSource.indexOf('function WaitlistView'),
  dashboardSource.indexOf('function WaitlistContactDetailModal'),
);
const approveModalSource = dashboardSource.slice(
  dashboardSource.indexOf('function ApprovePendingContactModal'),
  dashboardSource.indexOf('function waitlistFullMessage'),
);

describe('waitlist UI 7 presentation source', () => {
  it('renders the approved header, KPIs, compact toolbar, and full-width table', () => {
    expect(dashboardSource).toContain("waitlist: 'Lista de Espera'");
    expect(dashboardSource).toContain(
      "waitlist: 'Contatos recebidos pelo WhatsApp aguardando atendimento.'",
    );
    expect(waitlistViewSource).not.toContain('eyebrow="CRM NOVO UI 2.0"');
    expect(dashboardSource).toContain("label: 'Pendentes'");
    expect(dashboardSource).toContain("label: 'Aprovados hoje'");
    expect(dashboardSource).toContain("label: 'Ignorados'");
    expect(dashboardSource).toContain("label: 'Total filtrado'");
    expect(dashboardSource).toContain("description: 'Aguardando atendimento'");
    expect(dashboardSource).toContain("description: 'Convertidos em clientes'");
    expect(dashboardSource).toContain('placeholder="Buscar por nome ou telefone..."');
    expect(dashboardSource).toContain('className="workspace-main waitlist-workspace"');
    expect(dashboardSource).toContain('className="toolbar waitlist-toolbar"');
    expect(dashboardSource).toContain('className="waitlist-table"');
    expect(dashboardSource).not.toContain('className="workspace-grid waitlist-grid"');
    expect(dashboardSource).not.toContain('className="detail-panel"');
    expect(stylesSource).toContain('.waitlist-workspace');
    expect(stylesSource).toContain('.waitlist-toolbar');
    expect(stylesSource).toContain('.waitlist-table');
  });

  it('keeps the table and status labels bound to existing fields only', () => {
    expect(dashboardSource).toContain('<th>Contato</th>');
    expect(dashboardSource).toContain('<th>WhatsApp</th>');
    expect(dashboardSource).toContain('<th>Ultima mensagem</th>');
    expect(dashboardSource).toContain('<th>Mensagens</th>');
    expect(dashboardSource).toContain('<th>Ultima interação</th>');
    expect(dashboardSource).toContain('contact.connection.name');
    expect(dashboardSource).toContain('function WaitlistContactAvatar');
    expect(dashboardSource).toContain('waitlistFullMessage(contact)');
    expect(dashboardSource).toContain('contact.messageCount');
    expect(dashboardSource).toContain('formatDateTime(contact.lastContactAt)');
    expect(dashboardSource).toContain("PENDENTE: 'Pendente'");
    expect(dashboardSource).toContain("APROVADO: 'Aprovado'");
    expect(dashboardSource).toContain("IGNORADO: 'Ignorado'");
  });

  it('opens detail, approve, and ignore modals without wiring POST actions to open or cancel buttons', () => {
    expect(dashboardSource).toContain('function WaitlistContactDetailModal');
    expect(dashboardSource).toContain('Detalhes do contato');
    expect(dashboardSource).toContain('Conversa');
    expect(dashboardSource).toContain('setApproveContact(contact)');
    expect(dashboardSource).toContain('setIgnoreContact(contact)');
    expect(dashboardSource).toContain('function IgnorePendingContactModal');
    expect(dashboardSource).toContain('Ignorar contato');
    expect(dashboardSource).toContain('onClick={onClose}');
    expect(dashboardSource).toContain('onConfirm={() => void handleIgnore(ignoreContact)}');
    expect(dashboardSource).not.toContain('onClick={() => void handleIgnore(selected)}');
  });

  it('organizes approval into visual steps and preserves submit-only approval', () => {
    expect(dashboardSource).toContain('function ApprovePendingContactModal');
    expect(dashboardSource).toContain('Aprovar contato');
    expect(dashboardSource).toContain(
      "type WaitlistApprovalStep = 'client' | 'reference' | 'billing' | 'referral'",
    );
    expect(dashboardSource).toContain("label: 'Cliente'");
    expect(dashboardSource).toContain("label: 'Referência'");
    expect(dashboardSource).toContain("label: 'Cobrança'");
    expect(dashboardSource).toContain("label: 'Indicação'");
    expect(dashboardSource).toContain('className="waitlist-stepper"');
    expect(dashboardSource).toContain('onClick={() => goToStep(step.id)}');
    expect(dashboardSource).toContain('function handleNext()');
    expect(dashboardSource).toContain('function handlePrevious()');
    expect(dashboardSource).toContain('function handleFormKeyDown');
    expect(dashboardSource).toContain('if (!isLastStep)');
    expect(dashboardSource).toContain('if (loading || approvalSubmittingRef.current) return;');
    expect(dashboardSource).toContain('Dados do cliente');
    expect(dashboardSource).toContain('Primeira referência');
    expect(dashboardSource).toContain('Cobrança inicial');
    expect(dashboardSource).toContain('Indicação');
    expect(dashboardSource).toContain('Resumo antes de aprovar');
    expect(dashboardSource).toContain('sortPlansByDuration(plans)');
    expect(dashboardSource).toContain('generateInitialReceivable');
    expect(dashboardSource).toContain('sendPixWhatsAppNow');
    expect(dashboardSource).toContain(
      'O cadastro pode ser concluído mesmo se a geração ou o envio do PIX falhar.',
    );
    expect(dashboardSource).toContain('Benefício padrão: Mês grátis.');
    expect(dashboardSource).toContain('Aprovar contato');
    expect(dashboardSource).toContain('onSubmit={(event) => void handleSubmit(event)}');
    expect(dashboardSource).toContain(
      'const client = await approveWhatsAppPendingContact(contact.id, {',
    );
    expect(dashboardSource).not.toContain('approveWhatsAppPendingContact(contact.id, { name });');
  });

  it('prevents premature approval submit while non-final steps are only local navigation', () => {
    expect(approveModalSource).toContain(
      'async function handleSubmit(event: FormEvent<HTMLFormElement>)',
    );
    expect(approveModalSource).toContain('event.preventDefault();');
    expect(approveModalSource).toContain('if (!isLastStep) {');
    expect(approveModalSource).toContain('if (loading || approvalSubmittingRef.current) return;');
    expect(approveModalSource).toContain('onKeyDown={handleFormKeyDown}');
    expect(approveModalSource).toContain('const approvalSubmittingRef = useRef(false);');
    expect(approveModalSource).toContain('approvalSubmittingRef.current = true;');
    expect(approveModalSource).toContain('approvalSubmittingRef.current = false;');
    expect(approveModalSource).toContain('waitlist-final-actions');
    expect(approveModalSource).toContain('key="approve-contact"');
    expect(approveModalSource).toContain('key="continue-approval-step"');
    expect(approveModalSource).toContain('type="submit"');
    expect(approveModalSource).toContain('Aprovar contato');
    expect(approveModalSource).toContain('onClick={handleNext}');
    expect(approveModalSource).toContain('onClick={handlePrevious}');
    expect(approveModalSource).toContain('type="button" onClick={onClose}');
    expect(approveModalSource).toContain('label="Fechar aprovação" type="button"');
    expect(approveModalSource.match(/type="submit"/g)).toHaveLength(1);
    expect(approveModalSource).not.toContain('finalApprovalReady');
    expect(approveModalSource).not.toContain('setTimeout');
    expect(approveModalSource).not.toContain(
      'approveWhatsAppPendingContact(contact.id, { name });',
    );
  });

  it('keeps billing step navigation away from the approval mutation', () => {
    expect(dashboardSource).toContain(
      "type WaitlistApprovalStep = 'client' | 'reference' | 'billing' | 'referral'",
    );
    expect(dashboardSource).toContain("{ id: 'client', label: 'Cliente' }");
    expect(dashboardSource).toContain("{ id: 'reference', label: 'Referência' }");
    expect(dashboardSource).toContain("{ id: 'billing', label: 'Cobrança' }");
    expect(dashboardSource).toContain("{ id: 'referral', label: 'Indicação' }");
    expect(approveModalSource).toContain("const isLastStep = activeStep === 'referral';");
    expect(approveModalSource).toContain(
      'const nextIndex = Math.min(activeStepIndex + 1, waitlistApprovalSteps.length - 1);',
    );
    expect(approveModalSource).toContain('onClick={handleNext}');
    expect(approveModalSource).toContain('type="button"');

    const billingSection = approveModalSource.slice(
      approveModalSource.indexOf("{activeStep === 'billing'"),
      approveModalSource.indexOf("{activeStep === 'referral'"),
    );
    const submitStart = approveModalSource.indexOf('async function handleSubmit');
    const submitSource = approveModalSource.slice(
      submitStart,
      approveModalSource.indexOf('return (', submitStart),
    );

    expect(billingSection).not.toContain('approveWhatsAppPendingContact');
    expect(submitSource).toContain('approveWhatsAppPendingContact(contact.id, {');
  });

  it('keeps approved and ignored actions constrained to existing lifecycle transitions', () => {
    expect(dashboardSource).toContain("contact.status === 'PENDENTE'");
    expect(dashboardSource).toContain("contact.status === 'IGNORADO'");
    expect(dashboardSource).toContain("contact.status === 'APROVADO'");
    expect(dashboardSource).toContain('Cliente criado');
    expect(dashboardSource).toContain('onReopen={(contact) => void handleReopen(contact)}');
    expect(dashboardSource).not.toContain('Restaurar aprovado');
    expect(dashboardSource).not.toContain('Excluir contato');
  });

  it('adds responsive and visual states for empty, message, approval, billing, pix, referral, and mobile layout', () => {
    expect(dashboardSource).toContain('Nenhum contato encontrado.');
    expect(dashboardSource).toContain('Novos contatos recebidos pelo WhatsApp aparecerão aqui.');
    expect(stylesSource).toContain('.waitlist-message-preview');
    expect(stylesSource).toContain('-webkit-line-clamp: 2;');
    expect(stylesSource).toContain('.waitlist-detail-modal,');
    expect(stylesSource).toContain('.waitlist-approve-modal');
    expect(stylesSource).toContain('.waitlist-ignore-modal');
    expect(stylesSource).toContain('.waitlist-stepper');
    expect(stylesSource).toContain('.waitlist-step.active');
    expect(stylesSource).toContain('.waitlist-final-actions');
    expect(stylesSource).toContain('.waitlist-approval-section');
    expect(stylesSource).toContain('.waitlist-approval-summary');
    expect(stylesSource).toContain('@media (max-width: 620px)');
  });
});
