import { Inject, Injectable } from '@nestjs/common';
import { PaymentProviderCode } from '@prisma/client';
import { FastFlowPaymentProvider, FastPayPaymentProvider } from './fastdepix-payment.provider';
import { MockPaymentProvider } from './mock-payment.provider';
import { PaymentProviderCredentialsService } from './payment-provider-credentials.service';
import type {
  CreatePixInput,
  PaymentProvider,
  PaymentProviderPix,
  PaymentProviderStatus,
} from './payment-provider';

@Injectable()
export class PaymentProviderRegistryService implements PaymentProvider {
  constructor(
    @Inject(MockPaymentProvider) private readonly mock: MockPaymentProvider,
    @Inject(FastFlowPaymentProvider) private readonly fastFlow: FastFlowPaymentProvider,
    @Inject(FastPayPaymentProvider) private readonly fastPay: FastPayPaymentProvider,
    @Inject(PaymentProviderCredentialsService)
    private readonly credentials: PaymentProviderCredentialsService,
  ) {}

  async createPix(input: CreatePixInput): Promise<PaymentProviderPix> {
    const provider = await this.chooseProviderForPix();
    return provider.createPix(input);
  }

  getPixStatus(
    providerTransactionId: string,
    provider: PaymentProviderCode = 'MOCK',
  ): Promise<PaymentProviderStatus> {
    return this.byCode(provider).getPixStatus(providerTransactionId);
  }

  expirePix(providerTransactionId: string): Promise<PaymentProviderStatus> {
    return this.mock.expirePix(providerTransactionId);
  }

  cancelPix(
    providerTransactionId: string,
    provider: PaymentProviderCode = 'MOCK',
  ): Promise<PaymentProviderStatus> {
    const selected = this.byCode(provider);
    return selected.cancelPix
      ? selected.cancelPix(providerTransactionId)
      : selected.getPixStatus(providerTransactionId);
  }

  markPixPaid(providerTransactionId: string, paidAt?: Date): Promise<PaymentProviderStatus> {
    return this.mock.markPixPaid(providerTransactionId, paidAt);
  }

  private async chooseProviderForPix() {
    const defaultProvider = await this.credentials.getDefaultProvider();

    if (defaultProvider) {
      return this.byCode(defaultProvider);
    }

    if (await this.credentials.getActiveToken('FASTFLOW')) return this.fastFlow;
    if (await this.credentials.getActiveToken('FASTPAY')) return this.fastPay;
    return this.mock;
  }

  private byCode(provider: PaymentProviderCode) {
    if (provider === 'FASTFLOW') return this.fastFlow;
    if (provider === 'FASTPAY') return this.fastPay;
    return this.mock;
  }
}
