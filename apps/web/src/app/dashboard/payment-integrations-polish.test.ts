import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const dashboardSource = readFileSync(join(currentDir, 'page.tsx'), 'utf8');
const stylesSource = readFileSync(join(currentDir, '../globals.css'), 'utf8');
const settingsSource = dashboardSource.slice(
  dashboardSource.indexOf('function SettingsView'),
  dashboardSource.indexOf('function ClientEventIcon'),
);
const paymentCardSource = dashboardSource.slice(
  dashboardSource.indexOf('function PaymentProviderCard'),
  dashboardSource.indexOf('function paymentProviderLabel'),
);

describe('payment integrations workspace polish', () => {
  it('keeps the real providers and does not add unsupported providers', () => {
    expect(settingsSource).toContain("(['FASTFLOW', 'FASTPAY']");
    expect(settingsSource).toContain("provider === 'FASTFLOW' ? 'FastFlow' : 'FastPay'");
    expect(settingsSource).not.toContain("'DEPIX'");
  });

  it('renders operational cards instead of permanent inline technical forms', () => {
    expect(paymentCardSource).toContain('className="payment-provider-card"');
    expect(paymentCardSource).toContain('Conexão');
    expect(paymentCardSource).toContain('Webhook');
    expect(paymentCardSource).toContain('Última validação');
    expect(paymentCardSource).toContain('Provider padrão');
    expect(paymentCardSource).not.toContain('<dt>Status tecnico</dt>');
    expect(stylesSource).toContain('.payment-provider-grid');
    expect(stylesSource).toContain('grid-template-columns: repeat(2, minmax(0, 1fr));');
    expect(stylesSource).toContain('@media (max-width: 980px)');
    expect(stylesSource).toContain('.payment-provider-grid');
    expect(stylesSource).toContain('grid-template-columns: 1fr;');
  });

  it('never renders full existing credentials in the card or modal placeholders', () => {
    expect(paymentCardSource).toContain("credential.tokenMask ?? 'Não configurada'");
    expect(paymentCardSource).toContain(
      "credential.webhookSecretConfigured ? 'Configurado' : 'Não configurado'",
    );
    expect(paymentCardSource).toContain("placeholder={configured ? 'Chave configurada'");
    expect(paymentCardSource).not.toContain('tokenEncrypted');
    expect(paymentCardSource).not.toContain('webhookSecretEncrypted');
  });

  it('opens a compact configuration modal with only contract-supported fields', () => {
    expect(paymentCardSource).toContain('className="modal payment-provider-config-modal"');
    expect(paymentCardSource).toContain('Configurar {providerName}');
    expect(paymentCardSource).toContain('Nome da integração');
    expect(paymentCardSource).toContain('Chave API');
    expect(paymentCardSource).not.toContain('value={webhookSecret}');
    expect(paymentCardSource).toContain('Cancelar');
    expect(paymentCardSource).toContain('Salvar configuração');
    expect(stylesSource).toContain('.payment-provider-config-modal');
    expect(paymentCardSource).toContain('O secret será obtido automaticamente após o registro');
    expect(paymentCardSource).toContain('transaction.created');
    expect(paymentCardSource).toContain('transaction.refunded');
  });

  it('does not submit empty existing credentials and guards double submit/test', () => {
    expect(paymentCardSource).toContain('const canSaveCredential = token.trim().length >= 12;');
    expect(paymentCardSource).toContain('const canSubmitConfig = canSaveCredential;');
    expect(paymentCardSource).toContain('if (actionRef.current) return false;');
    expect(paymentCardSource).toContain('await guardedAction(async () =>');
    expect(paymentCardSource).toContain('if (!saved) return;');
    expect(paymentCardSource).toContain('await guardedAction(onTest, setTesting);');
    expect(settingsSource).toContain('const loadingRef = useRef(false);');
    expect(settingsSource).toContain('const actionRef = useRef(false);');
  });

  it('keeps action semantics in the global ActionMenu', () => {
    expect(paymentCardSource).toContain('<ActionMenu');
    expect(paymentCardSource).toContain("label: configured ? 'Editar configuração' : 'Configurar'");
    expect(paymentCardSource).toContain("label: 'Ver webhook'");
    expect(paymentCardSource).toContain("label: 'Definir como padrão'");
    expect(paymentCardSource).toContain("label: 'Configurar webhook'");
    expect(paymentCardSource).toContain("label: 'Desativar'");
    expect(paymentCardSource).toContain('danger: true');
  });

  it('supports cancel, close, escape, loading, success, error, and mobile states', () => {
    expect(paymentCardSource).toContain('closeConfigModal');
    expect(paymentCardSource).toContain("event.key === 'Escape'");
    expect(paymentCardSource).toContain('aria-label="Fechar"');
    expect(paymentCardSource).toContain("saving ? 'Salvando...' : 'Salvar configuração'");
    expect(paymentCardSource).toContain("testing ? 'Testando...' : 'Testar conexão'");
    expect(settingsSource).toContain('setNotice(success);');
    expect(settingsSource).toContain('setError(err instanceof Error ? err.message');
    expect(stylesSource).toContain('@media (max-width: 640px)');
  });
});
