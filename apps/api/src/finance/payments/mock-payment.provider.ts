import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CreatePixInput,
  PaymentProvider,
  PaymentProviderPix,
  PaymentProviderStatus,
  PaymentProviderTransaction,
} from './payment-provider';

type MockState = {
  amount: Prisma.Decimal;
  description: string;
  expiresAt: Date;
  status: PaymentProviderStatus['status'];
  paidAt: Date | null;
};

@Injectable()
export class MockPaymentProvider implements PaymentProvider {
  private readonly records = new Map<string, MockState>();

  createPix(input: CreatePixInput): Promise<PaymentProviderPix> {
    const providerTransactionId = `mock-pix-${input.receivableId}-${Date.now()}`;
    const state: MockState = {
      amount: input.amount,
      description: input.description,
      expiresAt: input.expiresAt,
      status: 'WAITING_PAYMENT',
      paidAt: null,
    };

    this.records.set(providerTransactionId, state);

    return Promise.resolve({
      provider: 'MOCK',
      providerTransactionId,
      externalStatus: state.status,
      externalDepixId: null,
      blockchainTxId: null,
      status: state.status,
      amount: input.amount,
      pixCopyPaste: `MOCK-PIX|${providerTransactionId}|${input.amount.toFixed(2)}`,
      qrCodeData: `mock://pix/${providerTransactionId}`,
      expiresAt: input.expiresAt,
    });
  }

  getPixStatus(providerTransactionId: string): Promise<PaymentProviderStatus> {
    return this.getPixTransaction(providerTransactionId).then((transaction) => ({
      provider: transaction.provider,
      providerTransactionId: transaction.providerTransactionId,
      externalStatus: transaction.externalStatus,
      externalDepixId: transaction.externalDepixId,
      blockchainTxId: transaction.blockchainTxId,
      status: transaction.status,
      paidAt: transaction.paidAt,
      failureCode: transaction.failureCode,
      failureMessage: transaction.failureMessage,
    }));
  }

  getPixTransaction(providerTransactionId: string): Promise<PaymentProviderTransaction> {
    const state = this.getState(providerTransactionId);

    if (state.status === 'WAITING_PAYMENT' && state.expiresAt.getTime() <= Date.now()) {
      state.status = 'EXPIRED';
    }

    return Promise.resolve({
      ...this.present(providerTransactionId, state),
      amount: state.amount,
      pixCopyPaste: `MOCK-PIX|${providerTransactionId}|${state.amount.toFixed(2)}`,
      qrCodeData: `mock://pix/${providerTransactionId}`,
      expiresAt: state.expiresAt,
    });
  }

  expirePix(providerTransactionId: string): Promise<PaymentProviderStatus> {
    const state = this.getState(providerTransactionId);
    state.status = 'EXPIRED';
    state.paidAt = null;

    return Promise.resolve(this.present(providerTransactionId, state));
  }

  cancelPix(providerTransactionId: string): Promise<PaymentProviderStatus> {
    const state = this.getState(providerTransactionId);
    state.status = 'CANCELED';
    state.paidAt = null;

    return Promise.resolve(this.present(providerTransactionId, state));
  }

  markPixPaid(providerTransactionId: string, paidAt = new Date()) {
    const state = this.getState(providerTransactionId);
    state.status = 'PAID';
    state.paidAt = paidAt;

    return Promise.resolve(this.present(providerTransactionId, state));
  }

  private getState(providerTransactionId: string) {
    const state = this.records.get(providerTransactionId);

    if (!state) {
      throw new NotFoundException('PIX mock nao encontrado no provider.');
    }

    return state;
  }

  private present(providerTransactionId: string, state: MockState): PaymentProviderStatus {
    return {
      provider: 'MOCK',
      providerTransactionId,
      externalStatus: state.status,
      externalDepixId: null,
      blockchainTxId: null,
      status: state.status,
      paidAt: state.paidAt,
      failureCode: null,
      failureMessage: null,
    };
  }
}
