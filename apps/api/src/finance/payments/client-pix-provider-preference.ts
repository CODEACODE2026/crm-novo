import { PaymentProviderCode } from '@prisma/client';

export const clientPreferredPixProviders = ['FASTFLOW', 'FASTPAY', 'FASTPIX'] as const;

export type ClientPreferredPixProvider = (typeof clientPreferredPixProviders)[number];

// Client preference stores only supported PIX providers; runtime availability is checked on PIX creation.
export function isClientPreferredPixProvider(
  provider: PaymentProviderCode,
): provider is ClientPreferredPixProvider {
  return clientPreferredPixProviders.includes(provider as ClientPreferredPixProvider);
}

export function paymentProviderDisplayName(provider: PaymentProviderCode) {
  if (provider === 'FASTFLOW') return 'FastFlow';
  if (provider === 'FASTPAY') return 'FastPay';
  if (provider === 'FASTPIX') return 'FastPIX';
  if (provider === 'MOCK') return 'Mock';
  return provider;
}
