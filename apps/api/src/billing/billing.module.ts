import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../common/prisma/prisma.module';
import { ReceivableCycleModule } from '../receivable-cycle/receivable-cycle.module';
import { KiragoAdminClient } from '../whatsapp/kirago/kirago-admin.client';
import { KiragoHttpClient } from '../whatsapp/kirago/kirago-http.client';
import { KiragoInstanceClient } from '../whatsapp/kirago/kirago-instance.client';
import { KiragoWhatsAppProvider } from '../whatsapp/kirago/kirago-whatsapp.provider';
import { WHATSAPP_PROVIDER } from '../whatsapp/provider/whatsapp-provider';
import { TokenEncryptionService } from '../whatsapp/security/token-encryption.service';
import { BillingController } from './billing.controller';
import { BillingScheduler } from './billing.scheduler';
import { BillingService } from './billing.service';
import { BillingTemplateRenderer } from './billing-template-renderer';

@Module({
  imports: [AuthModule, PrismaModule, ReceivableCycleModule],
  controllers: [BillingController],
  providers: [
    BillingService,
    BillingScheduler,
    BillingTemplateRenderer,
    KiragoAdminClient,
    KiragoHttpClient,
    KiragoInstanceClient,
    KiragoWhatsAppProvider,
    TokenEncryptionService,
    {
      provide: WHATSAPP_PROVIDER,
      useExisting: KiragoWhatsAppProvider,
    },
  ],
})
export class BillingModule {}
