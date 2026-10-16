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
const panelSource = inboxSource.slice(
  inboxSource.indexOf('function ConversationClientPanel('),
  inboxSource.indexOf('function ConversationFinancialSummary('),
);

describe('CONTACT-DRAWER-ORGANIZE1 contract', () => {
  it('opens each conversation in Summary and exposes only the three requested tabs', () => {
    expect(panelSource).toContain("useState<ContactDrawerTab>('summary')");
    expect(panelSource).toContain("setActiveTab('summary')");
    expect(inboxSource).toContain("{ id: 'summary', label: 'Resumo' }");
    expect(inboxSource).toContain("{ id: 'attendances', label: 'Atendimentos' }");
    expect(inboxSource).toContain("{ id: 'financial', label: 'Financeiro' }");
  });

  it('keeps the compact contact identity and client action in the stable header', () => {
    expect(panelSource).toContain('conversation-contact-drawer-header');
    expect(panelSource).toContain('ConversationContactHeader');
    expect(panelSource).toContain('id="conversation-contact-name"');
    expect(panelSource).toContain('Cliente vinculado');
    expect(panelSource).toContain('Abrir cliente');
    expect(panelSource).toContain('label="Fechar informações do contato"');
  });

  it('renders only the active tab and keeps the complete history out of Summary', () => {
    expect(panelSource).toContain("if (activeTab === 'attendances')");
    expect(panelSource).toContain('<ConversationAttendanceHistory');
    expect(panelSource).toContain('conversation-summary-tab');
    expect(panelSource).toContain('<ConversationActiveAttendanceSummary');
    expect(inboxSource).toContain('Nenhum atendimento registrado.');
    expect(inboxSource).toContain('Ver mais');
  });

  it('keeps the complete billing action surface only in Finance', () => {
    expect(panelSource).toContain("activeTab === 'financial'");
    expect(panelSource).toContain('<ConversationFinancialSummary');
    expect(panelSource).toContain('<ConversationRecentActivity');
    expect(panelSource).toContain('<ConversationReferenceList');
    expect(inboxSource).toContain('Copiar PIX');
    expect(inboxSource).toContain('Gerar PIX');
    expect(inboxSource).toContain('Renovar');
    expect(inboxSource).toContain('Reativar');
    expect(inboxSource).toContain('Ver cobrança');
  });

  it('handles linked, unlinked, loading, empty and isolated error states', () => {
    expect(panelSource).toContain('linkedConversation && !client');
    expect(panelSource).toContain('Carregando informações...');
    expect(panelSource).toContain('Atualizando informações financeiras...');
    expect(panelSource).toContain('role="alert"');
    expect(panelSource).toContain('Nenhuma cobrança encontrada.');
    expect(panelSource).toContain('Este contato não está vinculado a um cliente.');
    expect(panelSource).toContain('Contato não vinculado');
    expect(panelSource).toContain('Cadastrar cliente');
    expect(panelSource).toContain('Vincular a cliente');
  });

  it('preserves active attendance context without moving the full history into Summary', () => {
    expect(panelSource).toContain('Atendimento atual');
    expect(panelSource).toContain('Aguardando resposta humana há');
    expect(panelSource).toContain("pending ? 'Aguardando resposta humana há' : 'Aberto há'");
    expect(panelSource).toContain('recebidas');
    expect(panelSource).toContain('manuais');
    expect(panelSource).toContain('Resposta automática enviada');
  });

  it('uses accessible tabs with keyboard navigation and mobile-sized targets', () => {
    expect(panelSource).toContain('role="tablist"');
    expect(panelSource).toContain('role="tab"');
    expect(panelSource).toContain('role="tabpanel"');
    expect(panelSource).toContain('aria-selected={activeTab === tab.id}');
    expect(panelSource).toContain("event.key === 'ArrowRight'");
    expect(panelSource).toContain("event.key === 'Home'");
    expect(stylesSource).toContain('.conversation-contact-tabs button');
    expect(stylesSource).toContain('min-height: 44px');
  });

  it('keeps one scroll container and a compact responsive drawer', () => {
    expect(stylesSource).toContain('grid-template-rows: auto auto minmax(0, 1fr)');
    expect(stylesSource).toContain('.conversation-contact-tabpanel');
    expect(stylesSource).toContain('overflow-y: auto');
    expect(stylesSource).toContain('overflow-y: hidden');
    expect(stylesSource).toContain('@media (max-width: 620px)');
    expect(stylesSource).toContain('width: min(100vw, 440px)');
    expect(stylesSource).toContain('overflow-x: auto');
  });
});
