/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UpdateWhatsAppAutoReplyDto } from './dto/update-whatsapp-auto-reply.dto';
import { WhatsAppAutoReplyService } from './whatsapp-auto-reply.service';

const now = new Date('2026-10-15T12:00:00.000Z');
const connectionId = '11111111-1111-4111-8111-111111111111';
const conversationId = '22222222-2222-4222-8222-222222222222';
const configId = '33333333-3333-4333-8333-333333333333';
const triggerMessageId = '44444444-4444-4444-8444-444444444444';
const executionId = '55555555-5555-4555-8555-555555555555';
const outboundMessageId = '66666666-6666-4666-8666-666666666666';

function config(overrides: Record<string, unknown> = {}) {
  return {
    id: configId,
    whatsAppConnectionId: connectionId,
    enabled: true,
    mode: 'AWAY',
    message: 'Olá! Retornaremos em breve.',
    cooldownMinutes: 720,
    startsAt: null,
    endsAt: null,
    audience: 'ALL',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function context(overrides: Record<string, unknown> = {}) {
  return {
    id: conversationId,
    whatsAppConnectionId: connectionId,
    clientId: null,
    phoneNormalized: '5511999992815',
    lastAutoReplyAt: null,
    autoReplyExecutions: [],
    whatsAppConnection: {
      id: connectionId,
      status: 'CONNECTED',
      connected: true,
      loggedIn: true,
      providerTokenEncrypted: 'encrypted-token',
    },
    ...overrides,
  };
}

function factory(
  overrides: {
    config?: ReturnType<typeof config> | null;
    context?: ReturnType<typeof context> | null;
    executionCreate?: ReturnType<typeof vi.fn>;
    recentExecutionAfterClaim?: { id: string } | null;
    staleExecutions?: Array<{ id: string; messageId: string | null }>;
    providerSend?: ReturnType<typeof vi.fn>;
  } = {},
) {
  const executionCreate =
    overrides.executionCreate ?? vi.fn().mockResolvedValue({ id: executionId });
  const prisma = {
    whatsAppConnection: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi
        .fn()
        .mockResolvedValue({ id: connectionId, name: 'Principal', status: 'CONNECTED' }),
    },
    whatsAppAutoReplyConfig: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi
        .fn()
        .mockResolvedValue(overrides.config === undefined ? config() : overrides.config),
      upsert: vi.fn().mockResolvedValue(config()),
    },
    whatsAppConversation: {
      findFirst: vi
        .fn()
        .mockResolvedValue(overrides.context === undefined ? context() : overrides.context),
      update: vi.fn().mockResolvedValue({ id: conversationId }),
    },
    whatsAppAutoReplyExecution: {
      create: executionCreate,
      findMany: vi.fn().mockResolvedValue(overrides.staleExecutions ?? []),
      update: vi.fn().mockResolvedValue({ id: executionId }),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    whatsAppMessage: {
      create: vi.fn().mockResolvedValue({ id: outboundMessageId }),
      update: vi.fn().mockResolvedValue({ id: outboundMessageId }),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    $transaction: vi.fn(async (input: unknown) => {
      if (Array.isArray(input)) return Promise.all(input);
      return (input as (tx: unknown) => Promise<unknown>)({
        whatsAppAutoReplyExecution: {
          create: executionCreate,
          findFirst: vi.fn().mockResolvedValue(overrides.recentExecutionAfterClaim ?? null),
          update: vi.fn().mockResolvedValue({ id: executionId }),
        },
        whatsAppMessage: {
          create: prisma.whatsAppMessage.create,
        },
      });
    }),
  };
  const provider = {
    sendText:
      overrides.providerSend ??
      vi.fn().mockResolvedValue({ providerMessageId: 'provider-auto-reply', sentAt: now }),
  };
  const encryption = { decrypt: vi.fn().mockReturnValue('instance-token') };
  const realtime = {
    emitMessageCreated: vi.fn(),
    emitConversationUpdated: vi.fn(),
  };
  return {
    service: new WhatsAppAutoReplyService(
      prisma as never,
      provider as never,
      encryption as never,
      realtime as never,
    ),
    prisma,
    provider,
    realtime,
  };
}

describe('WhatsAppAutoReplyService', () => {
  beforeEach(() => vi.useFakeTimers().setSystemTime(now));
  afterEach(() => vi.useRealTimers());

  it('fails closed before persistence when a legacy row contains an explicit international phone', async () => {
    const { service, prisma, provider } = factory({
      context: context({
        phone: '+14076390665',
        phoneNormalized: '14076390665',
        phoneE164: null,
      }),
    });

    await expect(
      service.tryReplyToInbound({
        whatsAppConnectionId: connectionId,
        conversationId,
        triggerMessageId,
      }),
    ).resolves.toEqual({ sent: false, reason: 'international_outbound_disabled' });
    expect(prisma.whatsAppMessage.create).not.toHaveBeenCalled();
    expect(provider.sendText).not.toHaveBeenCalled();
  });

  it('requires a message when enabling and validates the optional schedule', async () => {
    const { service } = factory();
    await expect(
      service.updateConfig(connectionId, {
        enabled: true,
        mode: 'CUSTOM',
        message: '   ',
        cooldownMinutes: 60,
        audience: 'ALL',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.updateConfig(connectionId, {
        enabled: true,
        mode: 'AWAY',
        message: 'Ausente',
        cooldownMinutes: 60,
        audience: 'ALL',
        startsAt: '2026-10-16T12:00:00.000Z',
        endsAt: '2026-10-15T12:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('validates cooldown, mode, audience, dates and the 2000-character message boundary', async () => {
    const invalid = plainToInstance(UpdateWhatsAppAutoReplyDto, {
      enabled: true,
      mode: 'INVALID',
      message: 'x'.repeat(2001),
      cooldownMinutes: 0,
      audience: 'INVALID',
      startsAt: 'not-a-date',
      endsAt: 'also-not-a-date',
    });
    const valid = plainToInstance(UpdateWhatsAppAutoReplyDto, {
      enabled: true,
      mode: 'CUSTOM',
      message: 'x'.repeat(2000),
      cooldownMinutes: 43_200,
      audience: 'ALL',
      startsAt: null,
      endsAt: null,
    });

    expect((await validate(invalid)).map((error) => error.property).sort()).toEqual(
      ['audience', 'cooldownMinutes', 'endsAt', 'message', 'mode', 'startsAt'].sort(),
    );
    await expect(validate(valid)).resolves.toEqual([]);
  });

  it('creates or updates a connection-scoped config without deleting its history', async () => {
    const { service, prisma } = factory();
    const input = {
      enabled: false,
      mode: 'SERVICE_UNAVAILABLE' as const,
      message: '  Serviço em manutenção.  ',
      cooldownMinutes: 180,
      audience: 'LINKED_CLIENTS' as const,
      startsAt: null,
      endsAt: null,
    };

    await service.updateConfig(connectionId, input);

    expect(prisma.whatsAppAutoReplyConfig.upsert).toHaveBeenCalledWith({
      where: { whatsAppConnectionId: connectionId },
      create: expect.objectContaining({
        whatsAppConnectionId: connectionId,
        enabled: false,
        message: 'Serviço em manutenção.',
      }),
      update: expect.objectContaining({
        enabled: false,
        message: 'Serviço em manutenção.',
      }),
    });
  });

  it('sends one provider-first reply, persists its origin and marks manual follow-up', async () => {
    const { service, prisma, provider, realtime } = factory();

    await expect(
      service.tryReplyToInbound({
        whatsAppConnectionId: connectionId,
        conversationId,
        triggerMessageId,
      }),
    ).resolves.toMatchObject({ sent: true, messageId: outboundMessageId });

    expect(provider.sendText).toHaveBeenCalledWith('instance-token', {
      phone: '5511999992815',
      body: 'Olá! Retornaremos em breve.',
      requestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
    });
    expect(prisma.whatsAppMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        direction: 'OUTBOUND',
        text: 'Olá! Retornaremos em breve.',
        rawMetadata: expect.objectContaining({
          source: 'auto_reply',
          triggerMessageId,
        }),
      }),
      select: { id: true },
    });
    expect(prisma.whatsAppConversation.update).toHaveBeenCalledWith({
      where: { id: conversationId },
      data: expect.objectContaining({
        lastMessagePreview: 'Olá! Retornaremos em breve.',
        needsManualFollowUp: true,
        lastAutoReplyAt: now,
      }),
    });
    expect(prisma.whatsAppConversation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ unreadCount: expect.anything() }),
      }),
    );
    expect(prisma.whatsAppAutoReplyExecution.update).toHaveBeenCalledWith({
      where: { id: executionId },
      data: expect.objectContaining({ status: 'SENT', reservationKey: null }),
    });
    expect(realtime.emitMessageCreated).toHaveBeenCalledWith(
      conversationId,
      outboundMessageId,
      'OUTBOUND',
    );
  });

  it.each([
    ['disabled', config({ enabled: false }), context()],
    ['outside_schedule', config({ startsAt: new Date('2026-10-16T00:00:00.000Z') }), context()],
    ['audience', config({ audience: 'LINKED_CLIENTS' }), context({ clientId: null })],
    [
      'cooldown',
      config(),
      context({ autoReplyExecutions: [{ sentAt: new Date('2026-10-15T11:30:00.000Z') }] }),
    ],
  ])(
    'does not send when eligibility resolves to %s',
    async (reason, currentConfig, currentContext) => {
      const { service, provider } = factory({ config: currentConfig, context: currentContext });
      await expect(
        service.tryReplyToInbound({
          whatsAppConnectionId: connectionId,
          conversationId,
          triggerMessageId,
        }),
      ).resolves.toMatchObject({ sent: false, reason });
      expect(provider.sendText).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['before_start', config({ startsAt: new Date(now.getTime() + 1) }), false],
    ['at_start', config({ startsAt: now }), true],
    [
      'inside_window',
      config({
        startsAt: new Date(now.getTime() - 1),
        endsAt: new Date(now.getTime() + 1),
      }),
      true,
    ],
    ['at_end', config({ endsAt: now }), false],
    ['after_end', config({ endsAt: new Date(now.getTime() - 1) }), false],
    ['without_window', config(), true],
  ])('applies the documented schedule boundary %s', async (_case, currentConfig, shouldSend) => {
    const { service, provider } = factory({ config: currentConfig });
    const result = await service.tryReplyToInbound({
      whatsAppConnectionId: connectionId,
      conversationId,
      triggerMessageId,
    });

    expect(result.sent).toBe(shouldSend);
    expect(provider.sendText).toHaveBeenCalledTimes(shouldSend ? 1 : 0);
  });

  it('allows a new automatic reply after the prior successful cooldown has expired', async () => {
    const { service, provider } = factory({
      context: context({
        autoReplyExecutions: [{ sentAt: new Date(now.getTime() - 721 * 60_000) }],
      }),
    });

    await expect(
      service.tryReplyToInbound({
        whatsAppConnectionId: connectionId,
        conversationId,
        triggerMessageId,
      }),
    ).resolves.toMatchObject({ sent: true });
    expect(provider.sendText).toHaveBeenCalledTimes(1);
  });

  it('records provider failure without marking follow-up or emitting realtime', async () => {
    const { service, prisma, realtime } = factory({
      providerSend: vi.fn().mockRejectedValue(new Error('provider unavailable')),
    });
    await expect(
      service.tryReplyToInbound({
        whatsAppConnectionId: connectionId,
        conversationId,
        triggerMessageId,
      }),
    ).resolves.toEqual({ sent: false, reason: 'provider_failure' });
    expect(prisma.whatsAppAutoReplyExecution.update).toHaveBeenCalledWith({
      where: { id: executionId },
      data: { status: 'FAILED', errorCode: 'PROVIDER_FAILURE', reservationKey: null },
    });
    expect(prisma.whatsAppConversation.update).not.toHaveBeenCalled();
    expect(realtime.emitMessageCreated).not.toHaveBeenCalled();
  });

  it('uses database uniqueness to suppress duplicate webhook and concurrent triggers', async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError('unique', {
      code: 'P2002',
      clientVersion: '6.19.3',
    });
    const { service, provider } = factory({
      executionCreate: vi.fn().mockRejectedValue(conflict),
    });
    await expect(
      service.tryReplyToInbound({
        whatsAppConnectionId: connectionId,
        conversationId,
        triggerMessageId,
      }),
    ).resolves.toEqual({ sent: false, reason: 'duplicate_or_concurrent' });
    expect(provider.sendText).not.toHaveBeenCalled();
  });

  it('rechecks cooldown after claiming the database reservation', async () => {
    const { service, provider, prisma } = factory({
      recentExecutionAfterClaim: { id: '77777777-7777-4777-8777-777777777777' },
    });

    await expect(
      service.tryReplyToInbound({
        whatsAppConnectionId: connectionId,
        conversationId,
        triggerMessageId,
      }),
    ).resolves.toEqual({ sent: false, reason: 'cooldown' });

    expect(prisma.whatsAppMessage.create).not.toHaveBeenCalled();
    expect(provider.sendText).not.toHaveBeenCalled();
  });

  it('expires an abandoned reservation, fails its pending message and permits a new attempt', async () => {
    const staleExecutionId = '77777777-7777-4777-8777-777777777777';
    const staleMessageId = '88888888-8888-4888-8888-888888888888';
    const { service, prisma, provider } = factory({
      staleExecutions: [{ id: staleExecutionId, messageId: staleMessageId }],
    });

    await expect(
      service.tryReplyToInbound({
        whatsAppConnectionId: connectionId,
        conversationId,
        triggerMessageId,
      }),
    ).resolves.toMatchObject({ sent: true });

    expect(prisma.whatsAppAutoReplyExecution.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: [staleExecutionId] },
        reservationKey: conversationId,
        status: 'PENDING',
      },
      data: { status: 'FAILED', errorCode: 'STALE_RESERVATION', reservationKey: null },
    });
    expect(prisma.whatsAppMessage.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [staleMessageId] }, status: 'PENDING' },
      data: { status: 'FAILED', failedAt: now },
    });
    expect(provider.sendText).toHaveBeenCalledTimes(1);
  });

  it('keeps request ids stable per trigger and distinct across different triggers', async () => {
    const first = factory();
    const replay = factory();
    const different = factory();
    const differentTrigger = '99999999-9999-4999-8999-999999999999';

    await first.service.tryReplyToInbound({
      whatsAppConnectionId: connectionId,
      conversationId,
      triggerMessageId,
    });
    await replay.service.tryReplyToInbound({
      whatsAppConnectionId: connectionId,
      conversationId,
      triggerMessageId,
    });
    await different.service.tryReplyToInbound({
      whatsAppConnectionId: connectionId,
      conversationId,
      triggerMessageId: differentTrigger,
    });

    const requestIdFrom = (sendText: ReturnType<typeof vi.fn>) => {
      const call = sendText.mock.calls[0] as unknown[] | undefined;
      const input = call?.[1] as { requestId?: unknown } | undefined;
      return typeof input?.requestId === 'string' ? input.requestId : null;
    };
    const firstRequestId = requestIdFrom(first.provider.sendText);
    const replayRequestId = requestIdFrom(replay.provider.sendText);
    const differentRequestId = requestIdFrom(different.provider.sendText);
    expect(firstRequestId).toBe(replayRequestId);
    expect(firstRequestId).not.toBe(differentRequestId);
  });

  it('fails closed when the conversation does not belong to the requested connection', async () => {
    const otherConnectionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const { service, prisma, provider } = factory({ context: null });

    await expect(
      service.tryReplyToInbound({
        whatsAppConnectionId: otherConnectionId,
        conversationId,
        triggerMessageId,
      }),
    ).resolves.toEqual({ sent: false, reason: 'ineligible_connection' });

    expect(prisma.whatsAppConversation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: conversationId, whatsAppConnectionId: otherConnectionId },
      }),
    );
    expect(prisma.whatsAppAutoReplyConfig.findUnique).not.toHaveBeenCalled();
    expect(provider.sendText).not.toHaveBeenCalled();
  });

  it('allows linked and unlinked audiences only for their matching conversation', async () => {
    const linked = factory({
      config: config({ audience: 'LINKED_CLIENTS' }),
      context: context({ clientId: '77777777-7777-4777-8777-777777777777' }),
    });
    await expect(
      linked.service.tryReplyToInbound({
        whatsAppConnectionId: connectionId,
        conversationId,
        triggerMessageId,
      }),
    ).resolves.toMatchObject({ sent: true });

    const unlinked = factory({
      config: config({ audience: 'UNLINKED_CONTACTS' }),
      context: context({ clientId: null }),
    });
    await expect(
      unlinked.service.tryReplyToInbound({
        whatsAppConnectionId: connectionId,
        conversationId,
        triggerMessageId: '88888888-8888-4888-8888-888888888888',
      }),
    ).resolves.toMatchObject({ sent: true });
  });

  it('blocks international auto-reply before reserving a message or calling the provider', async () => {
    const { service, prisma, provider } = factory({
      context: context({ phoneNormalized: '14076390665', phoneE164: '+14076390665' }),
    });

    await expect(
      service.tryReplyToInbound({
        whatsAppConnectionId: connectionId,
        conversationId,
        triggerMessageId,
      }),
    ).resolves.toEqual({ sent: false, reason: 'international_outbound_disabled' });

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(provider.sendText).not.toHaveBeenCalled();
  });
});
