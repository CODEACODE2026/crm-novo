import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const dashboardSource = readFileSync(join(currentDir, 'page.tsx'), 'utf8');
const stylesSource = readFileSync(join(currentDir, '../globals.css'), 'utf8');
const whatsappViewSource = dashboardSource.slice(
  dashboardSource.indexOf('function WhatsAppView'),
  dashboardSource.indexOf('function WaitlistView'),
);

describe('WhatsApp UI polish presentation source', () => {
  it('renders the connection and recent dispatch areas as a responsive two-column workspace', () => {
    expect(whatsappViewSource).toContain('className="whatsapp-grid"');
    expect(whatsappViewSource).toContain('Conexão WhatsApp');
    expect(whatsappViewSource).toContain('Status da integração com a API Kirago');
    expect(whatsappViewSource).toContain('Últimos envios');
    expect(stylesSource).toContain(
      'grid-template-columns: minmax(0, 1.15fr) minmax(340px, 0.85fr);',
    );
    expect(stylesSource).toContain('.whatsapp-panel');
    expect(stylesSource).toContain('@media (max-width: 980px)');
    expect(stylesSource).toContain('.whatsapp-grid');
    expect(stylesSource).toContain('grid-template-columns: 1fr;');
  });

  it('covers connected, disconnected, error, and loading status presentations', () => {
    expect(dashboardSource).toContain('function getWhatsAppConnectionStatusPresentation');
    expect(dashboardSource).toContain("badge: 'Conectado'");
    expect(dashboardSource).toContain("badge: 'Desconectado'");
    expect(dashboardSource).toContain("badge: 'Erro'");
    expect(dashboardSource).toContain("badge: 'Conectando'");
    expect(dashboardSource).toContain("badge: 'Atualizando'");
    expect(dashboardSource).toContain("connection.status === 'CONNECTED'");
    expect(dashboardSource).toContain(
      "connection.status === 'CONNECTING' || connection.status === 'QR_REQUIRED'",
    );
    expect(dashboardSource).toContain("connection.status === 'ERROR'");
  });

  it('keeps connection details informative and avoids exposing webhook URL outside the modal', () => {
    expect(whatsappViewSource).toContain('className="detail-list whatsapp-connection-details"');
    expect(whatsappViewSource).toContain('<dt>Conexão</dt>');
    expect(whatsappViewSource).toContain('<dt>Provider</dt>');
    expect(whatsappViewSource).toContain('<dt>Telefone</dt>');
    expect(whatsappViewSource).toContain('<dt>Ultima verificação</dt>');
    expect(whatsappViewSource).toContain('<dt>Webhook</dt>');
    expect(whatsappViewSource).toContain(
      'O WhatsApp é utilizado para o envio de cobranças, lembretes e comunicações',
    );

    const connectionPanelSource = whatsappViewSource.slice(
      whatsappViewSource.indexOf('<div className="whatsapp-grid">'),
      whatsappViewSource.indexOf('{qrOpen ?'),
    );

    expect(connectionPanelSource).not.toContain('webhookUrl');
    expect(whatsappViewSource).toContain("activeModal === 'webhook'");
    expect(whatsappViewSource).toContain('webhookUrl ??');
  });

  it('preserves refresh, disconnect, and global action menu handlers', () => {
    expect(whatsappViewSource).toContain('refreshWhatsAppPanel');
    expect(whatsappViewSource).toContain('Atualizar conexão');
    expect(whatsappViewSource).toContain('handleDisconnect');
    expect(whatsappViewSource).toContain('Desconectar');
    expect(whatsappViewSource).toContain('<ActionMenu');
    expect(whatsappViewSource).toContain('label="Mais ações"');
    expect(whatsappViewSource).toContain('openWebhookModal');
    expect(whatsappViewSource).toContain('handleManualStatusRefresh');
    expect(whatsappViewSource).toContain('openDiagnosticModal');
    expect(whatsappViewSource).toContain('openLogoutConfirmation');
    expect(stylesSource).toContain('.action-menu-portal');
    expect(stylesSource).not.toContain('.technical-actions-menu');
  });

  it('remains the official place to administer the Kirago connection', () => {
    expect(whatsappViewSource).toContain('Conectar WhatsApp');
    expect(whatsappViewSource).toContain('Atualizar conexão');
    expect(whatsappViewSource).toContain('Desconectar');
    expect(whatsappViewSource).toContain('Webhook WhatsApp');
    expect(whatsappViewSource).toContain('Diagnóstico WhatsApp');
    expect(whatsappViewSource).toContain('Últimos envios');
  });

  it('renders recent dispatch cards with friendly labels, badges, and clamped message previews', () => {
    expect(whatsappViewSource).toContain('messages.map((message) =>');
    expect(whatsappViewSource).toContain("message.client?.name ?? 'Cliente não vinculado'");
    expect(whatsappViewSource).toContain('normalizeWhatsAppDisplayPhone(message.phone)');
    expect(whatsappViewSource).toContain('message.renderedContent ?? message.body');
    expect(whatsappViewSource).toContain('messageDispatchOriginLabel(message.origin)');
    expect(whatsappViewSource).toContain('messageDispatchStatusLabel(message.status)');
    expect(stylesSource).toContain('.message-history .message-preview');
    expect(stylesSource).toContain('-webkit-line-clamp: 2;');
    expect(stylesSource).toContain('.dispatch-status.success');
    expect(stylesSource).toContain('.dispatch-status.warning');
    expect(stylesSource).toContain('.dispatch-status.danger');
    expect(dashboardSource).toContain("SCHEDULED: 'Agendado'");
    expect(dashboardSource).toContain("SENT: 'Enviado'");
    expect(dashboardSource).toContain("CANCELED: 'Cancelado'");
    expect(dashboardSource).toContain("FAILED: 'Falha'");
    expect(dashboardSource).toContain("IGNORED: 'Ignorado'");
    expect(dashboardSource).toContain("BILLING: 'Cobrança'");
    expect(dashboardSource).toContain("RECOVERY: 'Recuperação'");
  });

  it('shows the approved empty state copy for recent dispatches', () => {
    expect(whatsappViewSource).toContain('Nenhum envio recente.');
    expect(whatsappViewSource).toContain('Os envios realizados pelo sistema aparecerão aqui.');
  });
});
