import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../common/prisma/prisma.module';
import { FinanceModule } from '../finance/finance.module';
import { PlansModule } from '../plans/plans.module';
import { ReferralsModule } from '../referrals/referrals.module';
import { KiragoAdminClient } from './kirago/kirago-admin.client';
import { KiragoHttpClient } from './kirago/kirago-http.client';
import { KiragoInstanceClient } from './kirago/kirago-instance.client';
import { KiragoWebhookNormalizer } from './kirago/kirago-webhook-normalizer';
import { KiragoWhatsAppProvider } from './kirago/kirago-whatsapp.provider';
import { WHATSAPP_PROVIDER } from './provider/whatsapp-provider';
import { TokenEncryptionService } from './security/token-encryption.service';
import {
  PaymentIntentWhatsAppController,
  WhatsAppController,
  WhatsAppWebhookController,
} from './whatsapp.controller';
import { WhatsAppMediaStorageService } from './whatsapp-media-storage.service';
import { WhatsAppQuickRepliesService } from './whatsapp-quick-replies.service';
import { WhatsAppRealtimeService } from './whatsapp-realtime.service';
import { WhatsAppVoiceConversionService } from './whatsapp-voice-conversion.service';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppAutoReplyService } from './whatsapp-auto-reply.service';
import { WhatsAppAttendanceService } from './whatsapp-attendance.service';

@Module({
  imports: [AuthModule, PrismaModule, PlansModule, FinanceModule, ReferralsModule],
  controllers: [WhatsAppController, PaymentIntentWhatsAppController, WhatsAppWebhookController],
  providers: [
    KiragoAdminClient,
    KiragoHttpClient,
    KiragoInstanceClient,
    KiragoWebhookNormalizer,
    KiragoWhatsAppProvider,
    TokenEncryptionService,
    WhatsAppMediaStorageService,
    WhatsAppQuickRepliesService,
    WhatsAppRealtimeService,
    WhatsAppVoiceConversionService,
    WhatsAppAutoReplyService,
    WhatsAppAttendanceService,
    WhatsAppService,
    {
      provide: WHATSAPP_PROVIDER,
      useExisting: KiragoWhatsAppProvider,
    },
  ],
})
export class WhatsAppModule {}
