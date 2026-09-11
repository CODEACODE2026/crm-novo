import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../common/prisma/prisma.module';
import { PlansModule } from '../plans/plans.module';
import { KiragoAdminClient } from './kirago/kirago-admin.client';
import { KiragoHttpClient } from './kirago/kirago-http.client';
import { KiragoInstanceClient } from './kirago/kirago-instance.client';
import { KiragoWebhookNormalizer } from './kirago/kirago-webhook-normalizer';
import { KiragoWhatsAppProvider } from './kirago/kirago-whatsapp.provider';
import { WHATSAPP_PROVIDER } from './provider/whatsapp-provider';
import { TokenEncryptionService } from './security/token-encryption.service';
import { WhatsAppController, WhatsAppWebhookController } from './whatsapp.controller';
import { WhatsAppService } from './whatsapp.service';

@Module({
  imports: [AuthModule, PrismaModule, PlansModule],
  controllers: [WhatsAppController, WhatsAppWebhookController],
  providers: [
    KiragoAdminClient,
    KiragoHttpClient,
    KiragoInstanceClient,
    KiragoWebhookNormalizer,
    KiragoWhatsAppProvider,
    TokenEncryptionService,
    WhatsAppService,
    {
      provide: WHATSAPP_PROVIDER,
      useExisting: KiragoWhatsAppProvider,
    },
  ],
})
export class WhatsAppModule {}
