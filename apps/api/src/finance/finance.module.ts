import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ReceivableCycleModule } from '../receivable-cycle/receivable-cycle.module';
import { RecoveryModule } from '../recovery/recovery.module';
import { ReferralsModule } from '../referrals/referrals.module';
import { TokenEncryptionService } from '../whatsapp/security/token-encryption.service';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';
import { PaymentWebhookController } from './payment-webhook.controller';
import { FastDepixApiClient } from './payments/fastdepix-api.client';
import {
  FastFlowPaymentProvider,
  FastPayPaymentProvider,
} from './payments/fastdepix-payment.provider';
import { MockPaymentProvider } from './payments/mock-payment.provider';
import { PaymentProviderCredentialsService } from './payments/payment-provider-credentials.service';
import { PaymentProviderRegistryService } from './payments/payment-provider-registry.service';
import { PAYMENT_PROVIDER } from './payments/payment-provider';

@Module({
  imports: [AuthModule, ReceivableCycleModule, RecoveryModule, ReferralsModule],
  controllers: [FinanceController, PaymentWebhookController],
  providers: [
    FinanceService,
    FastDepixApiClient,
    FastFlowPaymentProvider,
    FastPayPaymentProvider,
    MockPaymentProvider,
    PaymentProviderCredentialsService,
    PaymentProviderRegistryService,
    TokenEncryptionService,
    { provide: PAYMENT_PROVIDER, useExisting: PaymentProviderRegistryService },
  ],
  exports: [FinanceService],
})
export class FinanceModule {}
