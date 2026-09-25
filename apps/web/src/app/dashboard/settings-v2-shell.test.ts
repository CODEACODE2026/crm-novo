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
const settingsBillingSource = dashboardSource.slice(
  dashboardSource.indexOf('function SettingsBillingAutomationPanel'),
  dashboardSource.indexOf('function SettingsPlaceholderPanel'),
);
const automationsSource = dashboardSource.slice(
  dashboardSource.indexOf('function AutomationsView'),
  dashboardSource.indexOf('function RecoveryCampaignDetailModal'),
);

describe('Settings V2 SET1 shell contracts', () => {
  it('opens Settings on Visão geral and declares only SET1 internal sections', () => {
    expect(dashboardSource).toContain("useState<SettingsSection>('overview')");
    expect(settingsViewSource).toContain('useState<SettingsSection>(initialSection)');
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
    expect(settingsViewSource).not.toContain('connectWhatsApp(');
  });

  it('centralizes BillingAutomationSettings in Configurações > Cobrança e automações', () => {
    expect(settingsViewSource).toContain('const [billingSettings, setBillingSettings]');
    expect(settingsViewSource).toContain(
      'applyBillingSettings(await getBillingAutomationSettings())',
    );
    expect(settingsViewSource).toContain("activeSection === 'billing' && !billingSettings");
    expect(settingsViewSource).toContain('await updateBillingAutomationSettings({');
    expect(settingsViewSource).toContain('enabled: billingEnabled');
    expect(settingsViewSource).toContain('sendTime: billingSendTime');
    expect(settingsViewSource).toContain('sendIntervalSeconds: parsedBillingInterval');
    expect(settingsViewSource).toContain('timezone: billingSettings.timezone');
    expect(settingsViewSource).not.toContain('reconcileBilling()');
    expect(settingsBillingSource).toContain('function SettingsBillingAutomationPanel');
    expect(settingsBillingSource).toContain('Cobrança automática');
    expect(settingsBillingSource).toContain('Ativar cobrança automática');
    expect(settingsBillingSource).toContain('Horário de envio');
    expect(settingsBillingSource).toContain('Intervalo entre mensagens');
    expect(settingsBillingSource).toContain(
      'Tempo de espera entre mensagens programadas para o mesmo lote',
    );
    expect(settingsBillingSource).toContain('min={3}');
    expect(settingsBillingSource).toContain('max={300}');
    expect(settingsBillingSource).toContain('Fuso horário');
    expect(settingsBillingSource).toContain("settings?.timezone ?? 'Indisponível'");
    expect(settingsBillingSource).toContain("value={settings ? sendTime : ''}");
    expect(settingsBillingSource).toContain("value={settings ? sendIntervalSeconds : ''}");
    expect(settingsBillingSource).toContain('Salvar configurações');
    expect(settingsBillingSource).toContain(
      'Os envios dependem de uma conexão WhatsApp operacional.',
    );
    expect(settingsBillingSource).not.toContain('Recuperação por inadimplência');
    expect(settingsBillingSource).not.toContain('Templates');
  });

  it('saves billing settings only from the CTA and protects double submit', () => {
    expect(settingsViewSource).toContain('const billingSaveRef = useRef(false);');
    expect(settingsViewSource).toContain('if (!billingSettings || billingSaveRef.current');
    expect(settingsViewSource).toContain('billingSaveRef.current = true;');
    expect(settingsViewSource).toContain('billingSaveRef.current = false;');
    expect(settingsViewSource).toContain("setNotice('Configurações salvas.')");
    expect(settingsBillingSource).toContain(
      'disabled={!dirty || !intervalValid || !sendTime || !settings}',
    );
    expect(settingsBillingSource).toContain('onClick={() => void onSave()}');
    expect(settingsBillingSource).not.toContain('onBlur');
  });

  it('keeps recovery, templates, and operation in Automations while linking to Settings', () => {
    expect(automationsSource).toContain('Configurar automação');
    expect(automationsSource).toContain('onOpenBillingSettings');
    expect(automationsSource).toContain('automation-billing-operation-grid');
    expect(automationsSource).not.toContain('saveBillingSettings');
    expect(automationsSource).not.toContain('updateBillingAutomationSettings');
    expect(automationsSource).toContain('title="Mensagens da automação"');
    expect(automationsSource).toContain('title="Recuperação por inadimplência"');
    expect(automationsSource).toContain(
      'void saveRecoverySettings({ sendTime: recoverySendTime })',
    );
    expect(automationsSource).toContain('title="Campanhas de recuperação"');
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
