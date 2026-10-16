import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const inboxSource = readFileSync(
  join(currentDir, '../../components/whatsapp/WhatsAppInbox.tsx'),
  'utf8',
);
const stylesSource = readFileSync(join(currentDir, '../globals.css'), 'utf8');
const listSource = inboxSource.slice(
  inboxSource.indexOf('function ConversationReferenceList('),
  inboxSource.indexOf('function ConversationReferenceCard('),
);
const cardSource = inboxSource.slice(
  inboxSource.indexOf('function ConversationReferenceCard('),
  inboxSource.indexOf('function ConversationStatusBadge('),
);
const toggleSource = cardSource.slice(
  cardSource.indexOf('<button'),
  cardSource.indexOf('</button>') + '</button>'.length,
);

describe('CONTACT-DRAWER-FINANCIAL-REFERENCES-COMPACT1 contract', () => {
  it('starts every reference collapsed and keeps only one expanded id', () => {
    expect(listSource).toContain('useState<string | null>(null)');
    expect(listSource).toContain('const expanded = expandedReferenceId === reference.id');
    expect(listSource).toContain('current === reference.id ? null : reference.id');
    expect(cardSource).toContain("conversation-reference-card${expanded ? ' is-expanded' : ''}");
  });

  it('resets invalid expansion when the client or reference collection changes', () => {
    expect(listSource).toContain("references.map((reference) => reference.id).join('|')");
    expect(listSource).toContain("referenceIdentity.split('|').includes(current)");
    expect(listSource).toContain('[client.id, referenceIdentity]');
  });

  it('shows only scan-friendly identity and financial data while collapsed', () => {
    expect(toggleSource).toContain('reference.reference');
    expect(toggleSource).toContain("reference.plan?.name ?? 'Plano não informado'");
    expect(toggleSource).toContain('ConversationStatusBadge');
    expect(toggleSource).toContain('ConversationReceivableStatusBadge');
    expect(toggleSource).toContain('formatCurrency(reference.recurringValue)');
    expect(toggleSource).toContain('formatDate(reference.dueDate)');
    expect(toggleSource).toContain('pixSummary');
  });

  it('does not invent PIX or financial values when those records are absent', () => {
    expect(cardSource).toContain(": 'Sem cobrança em aberto'");
    expect(cardSource).toContain(': null;');
    expect(toggleSource).toContain('{pixSummary ? <span>{pixSummary}</span> : null}');
  });

  it('mounts full reference, receivable and PIX details only when expanded', () => {
    expect(cardSource).toContain('{expanded ? (');
    expect(cardSource).toContain('conversation-reference-details');
    expect(cardSource).toContain('Dia base');
    expect(cardSource).toContain('Situação financeira');
    expect(cardSource).toContain('reference.notes');
    expect(cardSource).toContain('visiblePix.expiresAt');
    expect(cardSource).toContain('formatDateTime(visiblePix.expiresAt)');
  });

  it('preserves every existing financial and client action handler', () => {
    expect(cardSource).toContain('onCopyPix(visiblePix)');
    expect(cardSource).toContain('onSendPixWhatsApp(openReceivable, visiblePix)');
    expect(cardSource).toContain('onRecreatePix(openReceivable, visiblePix)');
    expect(cardSource).toContain('onGeneratePix(openReceivable)');
    expect(cardSource).toContain('onViewReceivable(clientId, relevantReceivable)');
    expect(cardSource).toContain('onRenewReference(reference)');
    expect(cardSource).toContain('onReactivateReference(reference)');
    expect(cardSource).toContain('onOpenClient(clientId)');
  });

  it('uses an accessible native toggle without nested interactive elements', () => {
    expect(toggleSource).toContain('type="button"');
    expect(toggleSource).toContain('aria-expanded={expanded}');
    expect(toggleSource).toContain('aria-controls={detailsId}');
    expect(toggleSource).toContain('aria-hidden="true"');
    expect(toggleSource.match(/<button/g)).toHaveLength(1);
    expect(toggleSource).not.toContain('<Button');
    expect(toggleSource).not.toContain('<a ');
    expect(cardSource).toContain('id={detailsId}');
    expect(stylesSource).toContain('.conversation-reference-toggle:focus-visible');
  });

  it('truncates compact text and wraps complete details without horizontal growth', () => {
    expect(toggleSource).toContain('title={reference.reference}');
    expect(stylesSource).toContain('.conversation-reference-primary-row > strong');
    expect(stylesSource).toContain('text-overflow: ellipsis');
    expect(stylesSource).toContain('.conversation-reference-details');
    expect(stylesSource).toContain('overflow-wrap: anywhere');
    expect(stylesSource).toContain('min-width: 0');
  });

  it('keeps compact dimensions and touch-sized stacked mobile actions', () => {
    expect(stylesSource).toContain('min-height: 82px');
    expect(stylesSource).toContain('min-height: 78px');
    expect(stylesSource).toContain('.conversation-reference-details .ui-button');
    expect(stylesSource).toContain('min-height: 44px');
    expect(stylesSource).toContain('grid-template-columns: 1fr');
    expect(stylesSource).toContain('width: min(430px, calc(100vw - 24px))');
  });

  it('leaves financial summary and recent activity semantics outside the accordion', () => {
    expect(inboxSource).toContain('function ConversationFinancialSummary(');
    expect(inboxSource).toContain('Referências ativas');
    expect(inboxSource).toContain('function ConversationRecentActivity(');
    expect(inboxSource).toContain('Atividade recente');
    expect(listSource).not.toContain('ConversationRecentActivity');
  });
});
