import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const dashboardSource = readFileSync(join(currentDir, 'page.tsx'), 'utf8');
const stylesSource = readFileSync(join(currentDir, '../globals.css'), 'utf8');
const apiSource = readFileSync(join(currentDir, '../../lib/crm-api.ts'), 'utf8');

describe('referrals UI 2.0 presentation source', () => {
  it('renders the referrals header, approved KPIs, and compact workspace', () => {
    expect(dashboardSource).toContain('title="Indicações"');
    expect(dashboardSource).toContain(
      'subtitle="Acompanhe indicações, qualificações e benefícios dos clientes."',
    );
    expect(dashboardSource).toContain("label: 'Total'");
    expect(dashboardSource).toContain("label: 'Pendentes'");
    expect(dashboardSource).toContain("label: 'Qualificadas'");
    expect(dashboardSource).toContain("label: 'Benefícios aplicados'");
    expect(dashboardSource).toContain("label: 'Canceladas'");
    expect(dashboardSource).toContain('referrals-workspace');
    expect(stylesSource).toContain('.referrals-kpis');
    expect(stylesSource).toContain('.referrals-workspace');
  });

  it('keeps the toolbar and table bound to existing referral fields only', () => {
    expect(dashboardSource).toContain('placeholder="Buscar indicador ou indicado"');
    expect(dashboardSource).toContain('aria-label="Status da indicação"');
    expect(dashboardSource).toContain('aria-label="Indicador"');
    expect(dashboardSource).toContain('<th>Indicado</th>');
    expect(dashboardSource).toContain('<th>Indicador</th>');
    expect(dashboardSource).toContain('<th className="date-column">Data</th>');
    expect(dashboardSource).toContain('<th className="finance-status-column">Status</th>');
    expect(dashboardSource).toContain('<th>Benefício</th>');
    expect(dashboardSource).toContain('function ReferralClientCell');
    expect(dashboardSource).not.toContain('referral-client-role');
    expect(dashboardSource).not.toContain('Referência do indicador</th>');
    expect(dashboardSource).not.toContain('referência que indicou');
  });

  it('uses server-side pagination and keeps referral summary independent from status pages', () => {
    const referralsSource = dashboardSource.slice(
      dashboardSource.indexOf('function ReferralsView'),
      dashboardSource.indexOf('function ReferralClientCell'),
    );

    expect(referralsSource).toContain('const [page, setPage] = useState(1);');
    expect(referralsSource).toContain('const [pagination, setPagination]');
    expect(referralsSource).toContain('pageSize: listPageSize');
    expect(referralsSource).toContain('getReferralSummary(summaryFilters)');
    expect(referralsSource).toContain('...(status ? { status } : {})');
    expect(referralsSource).toContain('setPagination(list.pagination);');
    expect(referralsSource).toContain('setPage(Math.max(1, list.pagination.totalPages));');
    expect(referralsSource).toContain('pagination={pagination}');
    expect(referralsSource).toContain('itemLabel="indicações"');
    expect(referralsSource).toContain('onPageChange={setPage}');
    expect(referralsSource).not.toContain('slice(');
  });

  it('resets referrals page when search, status, or referrer filters change', () => {
    const referralsSource = dashboardSource.slice(
      dashboardSource.indexOf('function ReferralsView'),
      dashboardSource.indexOf('function ReferralClientCell'),
    );

    expect(referralsSource.match(/setPage\(1\);/g)).toHaveLength(3);
    expect(referralsSource).toContain('setSearch(event.target.value);');
    expect(referralsSource).toContain("setStatus(event.target.value as ReferralStatus | '');");
    expect(referralsSource).toContain('setReferrerClientId(event.target.value);');
  });

  it('uses semantic status and neutral benefit labels without changing enums', () => {
    const referralBenefitSource = dashboardSource.slice(
      dashboardSource.indexOf('function referralBenefitLabel'),
      dashboardSource.indexOf('function ReferralDetailModal'),
    );

    expect(dashboardSource).toContain("REWARDED: 'Benefício aplicado'");
    expect(dashboardSource).toContain("FREE_MONTH: 'Mês grátis'");
    expect(dashboardSource).toContain("CREDIT: 'Crédito'");
    expect(dashboardSource).toContain("CUSTOM: 'Personalizado'");
    expect(referralBenefitSource).toContain('Benefício registrado');
    expect(referralBenefitSource).not.toContain('Crédito disponível');
    expect(referralBenefitSource).not.toContain('Saldo');
    expect(referralBenefitSource).not.toContain('Crédito lançado');
  });

  it('opens details through GET /referrals/:id and renders progress from existing dates', () => {
    expect(apiSource).toContain('export function getReferral(id: string)');
    expect(apiSource).toContain('return apiFetch<Referral>(`/referrals/${id}`)');
    expect(dashboardSource).toContain('function ReferralDetailModal');
    expect(dashboardSource).toContain('Detalhes da indicação');
    expect(dashboardSource).toContain('Indicador');
    expect(dashboardSource).toContain('Indicado');
    expect(dashboardSource).toContain('Data da indicação');
    expect(dashboardSource).toContain('Motivo do cancelamento');
    expect(dashboardSource).toContain('function ReferralProgress');
    expect(dashboardSource).toContain('Indicação criada');
    expect(dashboardSource).toContain('Qualificada');
    expect(dashboardSource).toContain('Benefício aplicado');
    expect(dashboardSource).toContain('Cancelada');
    expect(dashboardSource).toContain('function referralProgressSteps');
    expect(dashboardSource).toContain("state: 'complete'");
    expect(dashboardSource).toContain("state: 'canceled'");
    expect(dashboardSource).toContain("? 'future'");
    expect(dashboardSource).toContain("? 'current'");
    expect(dashboardSource).toContain("'complete' | 'current' | 'future' | 'canceled'");
    expect(stylesSource).toContain('.referral-progress-icon.state-complete');
    expect(stylesSource).toContain('.referral-progress-icon.state-current');
    expect(stylesSource).toContain('.referral-progress-icon.state-future');
    expect(stylesSource).toContain('.referral-progress-icon.state-canceled');
  });

  it('keeps apply reward behind the modal submit action only', () => {
    expect(dashboardSource).toContain('function ReferralRewardModal');
    expect(dashboardSource).toContain('Conceda o benefício ao cliente que realizou a indicação.');
    expect(dashboardSource).toContain('onClick={onApply}');
    expect(dashboardSource).toContain('onClick={onClose}>Cancelar</Button>');
    expect(dashboardSource).toContain('label="Fechar aplicação de benefício"');
    expect(dashboardSource).not.toContain('onClick={() => void applyReward(referral)}');
  });

  it('makes FREE_MONTH reference selection explicit and calculates local preview fields', () => {
    expect(dashboardSource).toContain('Referência que receberá o benefício');
    expect(dashboardSource).toContain(
      'Escolha qual serviço do cliente indicador receberá o mês grátis.',
    );
    expect(dashboardSource).toContain('eligibleReferences.map((reference)');
    expect(dashboardSource).toContain('reference.plan.name');
    expect(dashboardSource).toContain('formatDate(reference.dueDate)');
    expect(dashboardSource).toContain('function buildFreeMonthPreview');
    expect(dashboardSource).toContain('addCalendarMonthsPreservingAnchor');
    expect(dashboardSource).toContain('reference.billingAnchorDay');
    expect(dashboardSource).toContain('freeMonthPreview?.currentDueDateLabel');
    expect(dashboardSource).toContain('freeMonthPreview?.newDueDateLabel');
    expect(dashboardSource).toContain('O mês grátis adia o próximo vencimento em 1 mês.');
    expect(dashboardSource).toContain('Boolean(freeMonthPreview)');
    expect(dashboardSource).toContain('disabled={isApplyDisabled}');
    expect(stylesSource).toContain('.free-month-preview');
    expect(stylesSource).toContain('.selected-reward-reference');
  });

  it('keeps FREE_MONTH selection local until the apply action posts once', () => {
    const modalSource = dashboardSource.slice(
      dashboardSource.indexOf('function ReferralRewardModal'),
      dashboardSource.indexOf('const reportDefinitions'),
    );
    const applyRewardSource = dashboardSource.slice(
      dashboardSource.indexOf('async function applyReward'),
      dashboardSource.indexOf('async function cancelCurrentReferral'),
    );

    expect(modalSource).toContain('onChange={(event) => onChangeReference(event.target.value)}');
    expect(modalSource).not.toContain('applyReferralReward(');
    expect(modalSource).not.toContain('POST');
    expect(modalSource).not.toContain('PATCH');
    expect(modalSource).not.toContain('PUT');
    expect(modalSource).not.toContain('DELETE');
    expect(applyRewardSource.match(/applyReferralReward\(/g)).toHaveLength(1);
    expect(applyRewardSource).toContain('clientReferenceId: rewardClientReferenceId');
    expect(applyRewardSource).not.toContain('newDueDate');
  });

  it('keeps canceling secondary and blocks rewarded/canceled apply actions visually', () => {
    expect(dashboardSource).toContain("referral.status === 'QUALIFIED'");
    expect(dashboardSource).toContain("referral.status !== 'REWARDED'");
    expect(dashboardSource).toContain("referral.status !== 'CANCELED'");
    expect(dashboardSource).toContain('referral-cancel-modal');
    expect(dashboardSource).toContain('Confirmar cancelamento');
  });

  it('refines client workspace referrals as read-only received and made sections', () => {
    expect(dashboardSource).toContain('client-referrals-panel');
    expect(dashboardSource).toContain('Indicação recebida');
    expect(dashboardSource).toContain('Indicações feitas');
    expect(dashboardSource).toContain('Este cliente não possui indicação recebida.');
    expect(dashboardSource).toContain('Nenhuma indicação realizada.');
    expect(dashboardSource).toContain('client-referral-summary');
    expect(stylesSource).toContain('.client-referral-section');
  });

  it('keeps desktop alignment and mobile structure available', () => {
    expect(dashboardSource).toContain('className="finance-status-column">Status');
    expect(dashboardSource).toContain('className="finance-actions-column">Ações');
    expect(dashboardSource).toContain('className="date-column"');
    expect(dashboardSource).toContain('Nenhuma indicação encontrada');
    expect(stylesSource).toContain('.referrals-table .empty-state svg');
    expect(stylesSource).toContain('.referrals-toolbar');
    expect(stylesSource).toContain('.referrals-table');
    expect(stylesSource).toContain('@media (max-width: 620px)');
    expect(stylesSource).toContain('.free-month-preview > svg');
  });
});
