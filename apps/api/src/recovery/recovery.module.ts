import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../common/prisma/prisma.module';
import { KiragoAdminClient } from '../whatsapp/kirago/kirago-admin.client';
import { KiragoHttpClient } from '../whatsapp/kirago/kirago-http.client';
import { KiragoInstanceClient } from '../whatsapp/kirago/kirago-instance.client';
import { KiragoWhatsAppProvider } from '../whatsapp/kirago/kirago-whatsapp.provider';
import { WHATSAPP_PROVIDER } from '../whatsapp/provider/whatsapp-provider';
import { TokenEncryptionService } from '../whatsapp/security/token-encryption.service';
import { BillingTemplateRenderer } from '../billing/billing-template-renderer';
import { RecoveryController } from './recovery.controller';
import { RecoveryScheduler } from './recovery.scheduler';
import { RecoveryService } from './recovery.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [RecoveryController],
  providers: [
    RecoveryService,
    RecoveryScheduler,
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
  exports: [RecoveryService],
})
export class RecoveryModule {}
