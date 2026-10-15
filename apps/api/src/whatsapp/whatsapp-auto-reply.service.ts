import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, WhatsAppAutoReplyAudience, WhatsAppAutoReplyMode } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../common/prisma/prisma.service';
import { KiragoProviderError } from './kirago/kirago-provider.error';
import { WHATSAPP_PROVIDER, type WhatsAppProvider } from './provider/whatsapp-provider';
import { TokenEncryptionService } from './security/token-encryption.service';
import { UpdateWhatsAppAutoReplyDto } from './dto/update-whatsapp-auto-reply.dto';
import { WhatsAppRealtimeService } from './whatsapp-realtime.service';

const reservationTtlMs = 5 * 60 * 1000;
const autoReplyPreviewLimit = 80;

class AutoReplyCooldownClaimError extends Error {}

@Injectable()
export class WhatsAppAutoReplyService {
  private readonly logger = new Logger(WhatsAppAutoReplyService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(WHATSAPP_PROVIDER) private readonly provider: WhatsAppProvider,
    @Inject(TokenEncryptionService) private readonly encryption: TokenEncryptionService,
    @Inject(WhatsAppRealtimeService) private readonly realtime: WhatsAppRealtimeService,
  ) {}

  async listConfigs() {
    const connections = await this.prisma.whatsAppConnection.findMany({
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, status: true },
    });
    const configs = await this.prisma.whatsAppAutoReplyConfig.findMany({
      where: { whatsAppConnectionId: { in: connections.map((connection) => connection.id) } },
    });
    const byConnection = new Map(configs.map((config) => [config.whatsAppConnectionId, config]));

    return connections.map((connection) =>
      this.presentConfig(connection, byConnection.get(connection.id) ?? null),
    );
  }

  async getConfig(whatsAppConnectionId: string) {
    const connection = await this.requireConnection(whatsAppConnectionId);
    const config = await this.prisma.whatsAppAutoReplyConfig.findUnique({
      where: { whatsAppConnectionId },
    });
    return this.presentConfig(connection, config);
  }

  async updateConfig(whatsAppConnectionId: string, dto: UpdateWhatsAppAutoReplyDto) {
    const connection = await this.requireConnection(whatsAppConnectionId);
    const message = dto.message.trim();
    if (dto.enabled && !message) {
      throw new BadRequestException('Informe a mensagem da resposta automatica.');
    }

    const startsAt = dto.startsAt ? new Date(dto.startsAt) : null;
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : null;
    if (startsAt && endsAt && startsAt.getTime() >= endsAt.getTime()) {
      throw new BadRequestException('O inicio do periodo deve ser anterior ao fim.');
    }

    const config = await this.prisma.whatsAppAutoReplyConfig.upsert({
      where: { whatsAppConnectionId },
      create: {
        whatsAppConnectionId,
        enabled: dto.enabled,
        mode: dto.mode,
        message,
        cooldownMinutes: dto.cooldownMinutes,
        audience: dto.audience,
        startsAt,
        endsAt,
      },
      update: {
        enabled: dto.enabled,
        mode: dto.mode,
        message,
        cooldownMinutes: dto.cooldownMinutes,
        audience: dto.audience,
        startsAt,
        endsAt,
      },
    });
    return this.presentConfig(connection, config);
  }

  async tryReplyToInbound(input: {
    whatsAppConnectionId: string;
    conversationId: string;
    triggerMessageId: string;
  }) {
    const now = new Date();
    const context = await this.prisma.whatsAppConversation.findFirst({
      where: {
        id: input.conversationId,
        whatsAppConnectionId: input.whatsAppConnectionId,
      },
      include: {
        whatsAppConnection: true,
        autoReplyExecutions: {
          where: { status: 'SENT' },
          orderBy: { sentAt: 'desc' },
          take: 1,
          select: { sentAt: true },
        },
      },
    });
    if (!context || !this.connectionOperational(context.whatsAppConnection)) {
      return { sent: false, reason: 'ineligible_connection' as const };
    }

    const config = await this.prisma.whatsAppAutoReplyConfig.findUnique({
      where: { whatsAppConnectionId: input.whatsAppConnectionId },
    });
    if (!config?.enabled || !config.message.trim()) {
      return { sent: false, reason: 'disabled' as const };
    }
    if (!this.withinSchedule(config.startsAt, config.endsAt, now)) {
      return { sent: false, reason: 'outside_schedule' as const };
    }
    if (!this.matchesAudience(config.audience, context.clientId)) {
      return { sent: false, reason: 'audience' as const };
    }

    const lastSentAt = context.autoReplyExecutions[0]?.sentAt ?? context.lastAutoReplyAt;
    if (lastSentAt && lastSentAt.getTime() + config.cooldownMinutes * 60_000 > now.getTime()) {
      return { sent: false, reason: 'cooldown' as const };
    }

    await this.releaseStaleReservation(context.id, now);
    const requestId = this.requestId(config.id, input.triggerMessageId);
    let claimed: { execution: { id: string }; message: { id: string } };
    try {
      claimed = await this.prisma.$transaction(async (tx) => {
        const execution = await tx.whatsAppAutoReplyExecution.create({
          data: {
            whatsAppConnectionId: input.whatsAppConnectionId,
            conversationId: context.id,
            configId: config.id,
            triggerMessageId: input.triggerMessageId,
            requestId,
            reservationKey: context.id,
            status: 'PENDING',
          },
          select: { id: true },
        });
        const recentExecution = await tx.whatsAppAutoReplyExecution.findFirst({
          where: {
            conversationId: context.id,
            id: { not: execution.id },
            status: 'SENT',
            sentAt: {
              gt: new Date(now.getTime() - config.cooldownMinutes * 60_000),
            },
          },
          select: { id: true },
        });
        if (recentExecution) throw new AutoReplyCooldownClaimError();
        const message = await tx.whatsAppMessage.create({
          data: {
            conversationId: context.id,
            whatsAppConnectionId: context.whatsAppConnectionId,
            provider: 'KIRAGO',
            providerMessageId: null,
            requestId,
            direction: 'OUTBOUND',
            type: 'TEXT',
            text: config.message.trim(),
            status: 'PENDING',
            isFromMe: true,
            rawMetadata: {
              source: 'auto_reply',
              autoReplyConfigId: config.id,
              autoReplyExecutionId: execution.id,
              triggerMessageId: input.triggerMessageId,
            },
          },
          select: { id: true },
        });
        await tx.whatsAppAutoReplyExecution.update({
          where: { id: execution.id },
          data: { messageId: message.id },
        });
        return { execution, message };
      });
    } catch (error) {
      if (error instanceof AutoReplyCooldownClaimError) {
        return { sent: false, reason: 'cooldown' as const };
      }
      if (this.isUniqueConflict(error)) {
        return { sent: false, reason: 'duplicate_or_concurrent' as const };
      }
      throw error;
    }
    const { execution, message } = claimed;

    let providerResult: { providerMessageId: string | null; sentAt?: Date | null };
    try {
      providerResult = await this.provider.sendText(
        this.encryption.decrypt(context.whatsAppConnection.providerTokenEncrypted),
        {
          phone: context.phoneNormalized,
          body: config.message.trim(),
          requestId,
        },
      );
    } catch (error) {
      const errorCode = this.safeErrorCode(error);
      await this.prisma.$transaction([
        this.prisma.whatsAppMessage.update({
          where: { id: message.id },
          data: { status: 'FAILED', failedAt: new Date() },
        }),
        this.prisma.whatsAppAutoReplyExecution.update({
          where: { id: execution.id },
          data: { status: 'FAILED', errorCode, reservationKey: null },
        }),
      ]);
      this.logger.warn(
        `WhatsApp auto-reply provider failed connection=${context.whatsAppConnectionId} conversation=${context.id} code=${errorCode}`,
      );
      return { sent: false, reason: 'provider_failure' as const };
    }

    const sentAt = providerResult.sentAt ?? new Date();
    await this.prisma.$transaction([
      this.prisma.whatsAppMessage.update({
        where: { id: message.id },
        data: {
          status: 'SENT',
          providerMessageId: providerResult.providerMessageId,
          sentAt,
          failedAt: null,
        },
      }),
      this.prisma.whatsAppAutoReplyExecution.update({
        where: { id: execution.id },
        data: {
          status: 'SENT',
          providerMessageId: providerResult.providerMessageId,
          sentAt,
          errorCode: null,
          reservationKey: null,
        },
      }),
      this.prisma.whatsAppConversation.update({
        where: { id: context.id },
        data: {
          lastMessageAt: sentAt,
          lastMessagePreview: this.preview(config.message),
          lastAutoReplyAt: sentAt,
          needsManualFollowUp: true,
        },
      }),
    ]);

    this.realtime.emitMessageCreated(context.id, message.id, 'OUTBOUND');
    this.realtime.emitConversationUpdated(context.id);
    return { sent: true, messageId: message.id, executionId: execution.id };
  }

  private async requireConnection(id: string) {
    const connection = await this.prisma.whatsAppConnection.findUnique({
      where: { id },
      select: { id: true, name: true, status: true },
    });
    if (!connection) throw new NotFoundException('Conexao WhatsApp nao encontrada.');
    return connection;
  }

  private presentConfig(
    connection: { id: string; name: string; status: string },
    config: {
      id: string;
      enabled: boolean;
      mode: WhatsAppAutoReplyMode;
      message: string;
      cooldownMinutes: number;
      audience: WhatsAppAutoReplyAudience;
      startsAt: Date | null;
      endsAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
    } | null,
  ) {
    return {
      id: config?.id ?? null,
      whatsAppConnectionId: connection.id,
      connectionName: connection.name,
      connectionStatus: connection.status,
      enabled: config?.enabled ?? false,
      mode: config?.mode ?? ('AWAY' as const),
      message: config?.message ?? '',
      cooldownMinutes: config?.cooldownMinutes ?? 720,
      audience: config?.audience ?? ('ALL' as const),
      startsAt: config?.startsAt ?? null,
      endsAt: config?.endsAt ?? null,
      timezone: 'America/Sao_Paulo',
      createdAt: config?.createdAt ?? null,
      updatedAt: config?.updatedAt ?? null,
    };
  }

  private connectionOperational(connection: {
    status: string;
    connected: boolean;
    loggedIn: boolean;
  }) {
    return connection.status === 'CONNECTED' && connection.connected && connection.loggedIn;
  }

  private withinSchedule(startsAt: Date | null, endsAt: Date | null, now: Date) {
    return (!startsAt || startsAt <= now) && (!endsAt || now < endsAt);
  }

  private matchesAudience(audience: WhatsAppAutoReplyAudience, clientId: string | null) {
    if (audience === 'LINKED_CLIENTS') return Boolean(clientId);
    if (audience === 'UNLINKED_CONTACTS') return !clientId;
    return true;
  }

  private async releaseStaleReservation(conversationId: string, now: Date) {
    const staleExecutions = await this.prisma.whatsAppAutoReplyExecution.findMany({
      where: {
        reservationKey: conversationId,
        status: 'PENDING',
        createdAt: { lt: new Date(now.getTime() - reservationTtlMs) },
      },
      select: { id: true, messageId: true },
    });

    if (!staleExecutions.length) return;

    const staleExecutionIds = staleExecutions.map((execution) => execution.id);
    const staleMessageIds = staleExecutions
      .map((execution) => execution.messageId)
      .filter((messageId): messageId is string => Boolean(messageId));

    await this.prisma.$transaction([
      this.prisma.whatsAppAutoReplyExecution.updateMany({
        where: {
          id: { in: staleExecutionIds },
          reservationKey: conversationId,
          status: 'PENDING',
        },
        data: { status: 'FAILED', errorCode: 'STALE_RESERVATION', reservationKey: null },
      }),
      ...(staleMessageIds.length
        ? [
            this.prisma.whatsAppMessage.updateMany({
              where: { id: { in: staleMessageIds }, status: 'PENDING' },
              data: { status: 'FAILED', failedAt: now },
            }),
          ]
        : []),
    ]);
  }

  private requestId(configId: string, triggerMessageId: string) {
    const hash = createHash('sha256')
      .update(`auto-reply:${configId}:${triggerMessageId}`)
      .digest('hex');
    return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
  }

  private preview(message: string) {
    const compact = message.trim().replace(/\s+/g, ' ');
    return compact.length <= autoReplyPreviewLimit
      ? compact
      : `${compact.slice(0, autoReplyPreviewLimit - 1)}…`;
  }

  private safeErrorCode(error: unknown) {
    if (error instanceof KiragoProviderError) return String(error.code).slice(0, 80);
    return 'PROVIDER_FAILURE';
  }

  private isUniqueConflict(error: unknown) {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
}
