import { Module } from '@nestjs/common';
import { PrismaModule } from '../common/prisma/prisma.module';
import { KiragoAdminClient } from './kirago/kirago-admin.client';
import { KiragoHttpClient } from './kirago/kirago-http.client';
import { KiragoInstanceClient } from './kirago/kirago-instance.client';
import { KiragoWhatsAppProvider } from './kirago/kirago-whatsapp.provider';
import { WHATSAPP_PROVIDER } from './provider/whatsapp-provider';
import { TokenEncryptionService } from './security/token-encryption.service';
import { WhatsAppController, WhatsAppWebhookController } from './whatsapp.controller';
import { WhatsAppService } from './whatsapp.service';

@Module({
  imports: [PrismaModule],
  controllers: [WhatsAppController, WhatsAppWebhookController],
  providers: [
    KiragoAdminClient,
    KiragoHttpClient,
    KiragoInstanceClient,
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
