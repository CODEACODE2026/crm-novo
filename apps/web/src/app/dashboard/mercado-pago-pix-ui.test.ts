import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const dashboardSource = fs.readFileSync(path.join(__dirname, 'page.tsx'), 'utf8');
const clientFormSource = fs.readFileSync(
  path.join(__dirname, '../../components/clients/client-form.tsx'),
  'utf8',
);

describe('Mercado Pago PIX UI contract', () => {
  it('exposes safe credential configuration with isolated environments', () => {
    expect(dashboardSource).toContain("'MERCADO_PAGO'");
    expect(dashboardSource).toContain('<option value="TEST">Teste</option>');
    expect(dashboardSource).toContain('<option disabled value="PRODUCTION">');
    expect(dashboardSource).toContain('Produção — bloqueada até homologação');
    expect(dashboardSource).toContain('type="password"');
    expect(dashboardSource).toContain('Salvar secret');
  });

  it('requires a current TEST proof and documents the official order webhook contract', () => {
    expect(dashboardSource).toContain('<dt>Prova TEST</dt>');
    expect(dashboardSource).toContain('<dt>Validade da prova</dt>');
    expect(dashboardSource).toContain('Order (Mercado Pago) — type=order');
    expect(dashboardSource).not.toContain('payment e order — confirmação autenticada no backend');
    expect(dashboardSource).toContain('A entrega HTTPS oficial permanece bloqueada');
  });

  it('offers Mercado Pago for individual preference and excludes it from grouped providers', () => {
    expect(clientFormSource).toContain("'MERCADO_PAGO'");
    expect(dashboardSource).toContain('const groupedPaymentProviders = [');
    const groupedProviders = dashboardSource.match(
      /const groupedPaymentProviders = \[([\s\S]*?)\] satisfies GroupedPaymentProvider\[\];/,
    )?.[1];
    expect(groupedProviders).toBeDefined();
    expect(groupedProviders).not.toContain('MERCADO_PAGO');
  });

  it('uses the existing WhatsApp action and requires backend-confirmed status', () => {
    expect(dashboardSource).toContain('sendPaymentIntentWhatsApp');
    expect(dashboardSource).toContain("const isPaidPix = activeStatus === 'PAID'");
    expect(dashboardSource).toContain("'Consultar pagamento'");
    expect(dashboardSource).not.toContain('markMercadoPagoAsPaid');
  });

  it('requests a valid missing email and lets the operator save it to the client', () => {
    expect(dashboardSource).toContain('E-mail para o Mercado Pago');
    expect(dashboardSource).toContain('Salvar este e-mail no cadastro do cliente');
    expect(dashboardSource).toContain('updateClient(receivable.client.id, { email })');
  });
});
