import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  brazilCanonicalMobileToLegacyVariant,
  brazilLegacyMobileVariant,
} from '../clients/utils/phone-normalizer';
import { normalizePhone } from '../common/phone/phone-normalizer';

@Injectable()
export class WhatsAppPreparedSuccessorGuardService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async assertAutomatedOutboundAllowed(whatsAppConnectionId: string, phone: string) {
    const phoneCandidates = this.phoneCandidates(phone);
    const preparation = await this.prisma.whatsAppConversationSuccessorPreparation.findFirst({
      where: {
        status: 'PREPARED',
        targetConnectionId: whatsAppConnectionId,
        successor: {
          is: {
            whatsAppConnectionId,
            phoneNormalized: { in: phoneCandidates },
          },
        },
      },
      select: { id: true },
    });

    if (!preparation) return;

    throw new ConflictException({
      code: 'WHATSAPP_PREPARED_SUCCESSOR_AUTOMATION_BLOCKED',
      message:
        'Envio automatico bloqueado enquanto a continuidade aguarda ativacao manual ou inbound real.',
    });
  }

  phoneCandidates(phone: string) {
    const digits = phone.replace(/\D/g, '');
    const candidates = new Set<string>();
    if (digits) candidates.add(digits);

    const identity = normalizePhone(digits.startsWith('+') ? digits : `+${digits}`);
    if (identity.status === 'valid') candidates.add(identity.digits);

    for (const candidate of [...candidates]) {
      const canonical = brazilLegacyMobileVariant(candidate);
      const legacy = brazilCanonicalMobileToLegacyVariant(candidate);
      if (canonical) candidates.add(canonical);
      if (legacy) candidates.add(legacy);
    }

    return [...candidates];
  }
}
