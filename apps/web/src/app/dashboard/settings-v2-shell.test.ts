import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const dashboardSource = readFileSync(join(currentDir, 'page.tsx'), 'utf8');
const stylesSource = readFileSync(join(currentDir, '../globals.css'), 'utf8');
const settingsSource = dashboardSource.slice(
  dashboardSource.indexOf('type SettingsSection'),
  dashboardSource.indexOf('function ClientEventIcon'),
);
const settingsViewSource = dashboardSource.slice(
  dashboardSource.indexOf('function SettingsView'),
  dashboardSource.indexOf('function SettingsOverview'),
);
const settingsPaymentsSource = dashboardSource.slice(
  dashboardSource.indexOf('function SettingsPaymentsPanel'),
  dashboardSource.indexOf('function SettingsPlaceholderPanel'),
);

describe('Settings V2 SET1 shell contracts', () => {
  it('opens Settings on Visão geral and declares only SET1 internal sections', () => {
    expect(settingsViewSource).toContain("useState<SettingsSection>('overview')");
    expect(settingsSource).toContain("id: 'overview'");
    expect(settingsSource).toContain("label: 'Visão geral'");
    expect(settingsSource).toContain("label: 'Financeiro'");
    expect(settingsSource).toContain("label: 'Pagamentos'");
    expect(settingsSource).toContain("label: 'WhatsApp'");
    expect(settingsSource).toContain("label: 'Cobrança e automações'");
    expect(settingsSource).toContain("label: 'Sistema'");
    expect(settingsSource).not.toContain("label: 'Geral'");
    expect(settingsSource).not.toContain("label: 'Usuários'");
  });

  it('renders the Settings home cards without forms', () => {
    expect(settingsSource).toContain('function SettingsOverview');
    expect(settingsSource).toContain('settings-v2-home-grid');
    expect(settingsSource).toContain("title: 'Financeiro'");
    expect(settingsSource).toContain("title: 'Pagamentos'");
    expect(settingsSource).toContain("title: 'WhatsApp'");
    expect(settingsSource).toContain("title: 'Cobrança e automações'");
    expect(settingsSource).toContain("title: 'Sistema'");
    expect(settingsSource).toContain('Abrir');
    expect(settingsSource).not.toContain('className="compact-form"');
  });

  it('shows the Financeiro home card as a real configured area when categories are loaded', () => {
    expect(settingsViewSource).toContain(
      'activeCategories={categories.filter((category) => category.active).length}',
    );
    expect(settingsSource).toContain('activeCategories: number;');
    expect(settingsSource).toContain('categoria${activeCategories === 1');
    expect(settingsSource).toContain('ativa${');
  });

  it('keeps Settings home copy product-facing instead of implementation-facing', () => {
    expect(settingsSource).not.toContain('CRUD permanece em Financeiro nesta etapa');
    expect(settingsSource).not.toContain('Operação preservada na área WhatsApp');
    expect(settingsSource).not.toContain('Administração será tratada em etapa posterior');
    expect(settingsSource).not.toContain("status: 'Somente leitura'");
    expect(settingsSource).toContain('Provedores PIX, credenciais e webhooks.');
    expect(settingsSource).toContain('Integração e comunicação pelo WhatsApp.');
    expect(settingsSource).toContain('Regras, mensagens e automações de cobrança.');
    expect(settingsSource).toContain('Status e informações técnicas do sistema.');
  });

  it('uses Portuguese payment provider summaries and compact card actions', () => {
    expect(settingsSource).toContain('function paymentProviderSummary');
    expect(settingsSource).toContain("'1 provedor configurado'");
    expect(settingsSource).toContain('provedores configurados');
    expect(settingsSource).toContain('Padrão: ${paymentProviderDisplay(defaultProvider)}');
    expect(settingsSource).not.toContain('provider(s)');
    expect(settingsSource).toContain('className="settings-v2-card-link"');
    expect(stylesSource).toContain('.settings-v2-card-link');
    expect(stylesSource).toContain('min-height: 148px;');
  });

  it('uses state-driven internal navigation and mobile select navigation', () => {
    expect(settingsViewSource).toContain('function openSection(section: SettingsSection)');
    expect(settingsViewSource).toContain('aria-current={activeSection === section.id');
    expect(settingsViewSource).toContain('aria-label="Navegação interna de configurações"');
    expect(settingsViewSource).toContain('settings-v2-mobile-nav');
    expect(stylesSource).toContain('.settings-v2-layout');
    expect(stylesSource).toContain('grid-template-columns: minmax(220px, 260px) minmax(0, 1fr);');
    expect(stylesSource).toContain('@media (max-width: 620px)');
    expect(stylesSource).toContain('.settings-v2-mobile-nav');
    expect(stylesSource).toContain('display: block;');
    expect(stylesSource).toContain('.settings-v2-nav');
    expect(stylesSource).toContain('display: none;');
  });

  it('keeps payments functional inside Configurações > Pagamentos', () => {
    expect(settingsViewSource).toContain("activeSection === 'payments'");
    expect(settingsSource).toContain('function SettingsPaymentsPanel');
    expect(settingsPaymentsSource).toContain('settings-v2-toolbar');
    expect(settingsPaymentsSource).not.toContain('<h2>Pagamentos</h2>');
    expect(settingsPaymentsSource).not.toContain('Configure os provedores utilizados');
    expect(settingsPaymentsSource).toContain("(['FASTFLOW', 'FASTPAY']");
    expect(settingsPaymentsSource).toContain('PaymentProviderCard');
    expect(settingsPaymentsSource).toContain('savePaymentProviderCredential(payload)');
    expect(settingsPaymentsSource).toContain('testPaymentProviderCredential(provider)');
    expect(settingsPaymentsSource).toContain('setDefaultPaymentProvider(provider)');
    expect(settingsPaymentsSource).toContain('registerPaymentWebhook(provider)');
    expect(settingsPaymentsSource).toContain('deactivatePaymentProviderCredential(provider)');
  });

  it('keeps SET1 sections as navigation summaries without moving operational CRUDs', () => {
    expect(settingsViewSource).toContain("activeSection === 'finance'");
    expect(settingsViewSource).toContain("activeSection === 'whatsapp'");
    expect(settingsViewSource).toContain('actionLabel="Abrir WhatsApp"');
    expect(settingsViewSource).toContain("activeSection === 'billing'");
    expect(settingsViewSource).toContain('actionLabel="Abrir Automações"');
    expect(settingsViewSource).not.toContain('connectWhatsApp(');
    expect(settingsViewSource).not.toContain('updateBillingAutomationSettings(');
  });

  it('centralizes financial category administration in Settings > Financeiro', () => {
    expect(settingsViewSource).toContain('const [categories, setCategories]');
    expect(settingsViewSource).toContain('setCategories(await listFinancialCategories())');
    expect(settingsSource).toContain('function SettingsFinancePanel');
    expect(settingsSource).toContain('<FinancialCategoriesView');
    expect(settingsViewSource).toContain('await createFinancialCategory(payload);');
    expect(settingsViewSource).toContain('await updateFinancialCategory(id, payload);');
    expect(settingsViewSource).toContain('await deleteFinancialCategory(id);');
    expect(settingsSource).toContain('Abrir Financeiro operacional');
    expect(settingsViewSource).not.toContain('As categorias financeiras serão centralizadas aqui');
  });

  it('renders Sistema as a read-only health panel without exposing secrets', () => {
    expect(settingsViewSource).toContain("activeSection === 'system'");
    expect(settingsSource).toContain('function SettingsSystemPanel');
    expect(settingsSource).toContain('getHealthStatus()');
    expect(settingsSource).toContain('Status seguro da API');
    expect(settingsSource).toContain('<dt>API</dt>');
    expect(settingsSource).toContain('<dt>Serviço</dt>');
    expect(settingsSource).toContain('<dt>Última verificação</dt>');
    expect(settingsSource).not.toContain('DATABASE_URL');
    expect(settingsSource).not.toContain('JWT_SECRET');
    expect(settingsSource).not.toContain('WHATSAPP_TOKEN_ENCRYPTION_KEY');
  });
});
