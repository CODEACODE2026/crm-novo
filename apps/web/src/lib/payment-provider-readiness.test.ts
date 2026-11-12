import { describe, expect, it } from 'vitest';
import type { PaymentProviderCredentialStatus } from './crm-api';
import {
  isOperationalPixProviderCredential,
  paymentProviderCredentialReadiness,
} from './payment-provider-readiness';

const now = new Date('2026-11-02T21:30:00.000Z');

function credential(
  overrides: Partial<PaymentProviderCredentialStatus> = {},
): PaymentProviderCredentialStatus {
  return {
    active: true,
    configured: true,
    environment: 'TEST',
    environmentProofExpiresAt: '2026-11-03T21:30:00.000Z',
    environmentProofStatus: 'VERIFIED_TEST',
    provider: 'MERCADO_PAGO',
    status: 'VALIDO',
    ...overrides,
  };
}

describe('payment provider UI readiness', () => {
  it('offers Mercado Pago only with a current VERIFIED_TEST proof', () => {
    expect(paymentProviderCredentialReadiness(credential(), now)).toMatchObject({
      label: 'TEST verificado',
      operational: true,
      tone: 'success',
    });
  });

  it('blocks Mercado Pago when the TEST proof is absent or expired', () => {
    expect(
      paymentProviderCredentialReadiness(
        credential({ environmentProofStatus: null, status: 'CONFIGURADO' }),
        now,
      ),
    ).toMatchObject({ label: 'Prova TEST pendente', operational: false });
    expect(
      paymentProviderCredentialReadiness(
        credential({ environmentProofExpiresAt: '2026-11-02T21:29:59.999Z' }),
        now,
      ),
    ).toMatchObject({ label: 'Prova TEST expirada', operational: false });
  });

  it('keeps PRODUCTION unavailable until its separate homologation', () => {
    expect(
      paymentProviderCredentialReadiness(credential({ environment: 'PRODUCTION' }), now),
    ).toMatchObject({ label: 'Produção bloqueada', operational: false, tone: 'danger' });
  });

  it('preserves the existing providers operational contract', () => {
    expect(
      isOperationalPixProviderCredential(
        credential({
          environment: 'PRODUCTION',
          environmentProofExpiresAt: null,
          environmentProofStatus: null,
          provider: 'FASTFLOW',
          status: 'CONFIGURADO',
        }),
        now,
      ),
    ).toBe(true);
  });
});
