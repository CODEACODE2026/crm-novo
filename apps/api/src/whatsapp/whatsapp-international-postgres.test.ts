import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

const runDatabaseTests = process.env.RUN_DATABASE_TESTS === '1';

describe.skipIf(!runDatabaseTests)('international WhatsApp identity persistence', () => {
  const prisma = new PrismaClient();
  const createdConnectionIds = new Set<string>();
  const createdConversationIds = new Set<string>();

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterEach(async () => {
    await prisma.whatsAppMessage.deleteMany({
      where: { conversationId: { in: [...createdConversationIds] } },
    });
    await prisma.whatsAppConversation.deleteMany({
      where: { id: { in: [...createdConversationIds] } },
    });
    await prisma.whatsAppConnection.deleteMany({
      where: { id: { in: [...createdConnectionIds] } },
    });
    createdConversationIds.clear();
    createdConnectionIds.clear();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('allows one canonical conversation per connection under concurrent creation', async () => {
    const connection = await createConnection();
    const phoneE164 = '+14076390665';
    const attempts = await Promise.allSettled([
      createConversation(connection.id, {
        phone: '+1 (407) 639-0665',
        phoneNormalized: '14076390665',
        phoneE164,
      }),
      createConversation(connection.id, {
        phone: '+1 407 639 0665',
        phoneNormalized: '14076390665-alternate',
        phoneE164,
      }),
    ]);

    const fulfilled = attempts.filter(
      (result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof createConversation>>> =>
        result.status === 'fulfilled',
    );
    const rejected = attempts.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toMatchObject({ code: 'P2002' });
    expect(
      await prisma.whatsAppConversation.count({
        where: { whatsAppConnectionId: connection.id, phoneE164 },
      }),
    ).toBe(1);
  });

  it('keeps international identities isolated by country and connection without merging', async () => {
    const firstConnection = await createConnection();
    const secondConnection = await createConnection();
    const us = await createConversation(firstConnection.id, {
      phone: '+1 (407) 639-0665',
      phoneNormalized: '14076390665',
      phoneE164: '+14076390665',
    });
    const portugal = await createConversation(firstConnection.id, {
      phone: '+351 912 345 678',
      phoneNormalized: '351912345678',
      phoneE164: '+351912345678',
    });
    const sameUsOnAnotherConnection = await createConversation(secondConnection.id, {
      phone: '+1 (407) 639-0665',
      phoneNormalized: '14076390665',
      phoneE164: '+14076390665',
    });

    expect(new Set([us.id, portugal.id, sameUsOnAnotherConnection.id]).size).toBe(3);
    expect(
      await prisma.whatsAppConversation.count({
        where: { id: { in: [us.id, portugal.id, sameUsOnAnotherConnection.id] } },
      }),
    ).toBe(3);
  });

  it('rolls back an inbound message and conversation mutation as one unit', async () => {
    const connection = await createConnection();
    const conversation = await createConversation(connection.id, {
      phone: '+44 7911 123456',
      phoneNormalized: '447911123456',
      phoneE164: '+447911123456',
      lastMessagePreview: 'Estado anterior',
      unreadCount: 2,
    });
    const providerMessageId = unique('phone-whatsapp-rollback-message');

    await expect(
      prisma.$transaction(async (tx) => {
        await tx.whatsAppMessage.create({
          data: {
            conversationId: conversation.id,
            whatsAppConnectionId: connection.id,
            providerMessageId,
            direction: 'INBOUND',
            type: 'TEXT',
            text: 'Nao persistir',
            status: 'DELIVERED',
            isFromMe: false,
          },
        });
        await tx.whatsAppConversation.update({
          where: { id: conversation.id },
          data: {
            lastMessagePreview: 'Nao persistir',
            unreadCount: { increment: 1 },
          },
        });
        throw new Error('forced WhatsApp rollback');
      }),
    ).rejects.toThrow('forced WhatsApp rollback');

    await expect(
      prisma.whatsAppMessage.count({
        where: { whatsAppConnectionId: connection.id, providerMessageId },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.whatsAppConversation.findUniqueOrThrow({ where: { id: conversation.id } }),
    ).resolves.toMatchObject({ lastMessagePreview: 'Estado anterior', unreadCount: 2 });
  });

  it('persists one idempotent manual international PENDING without changing the recipient', async () => {
    const connection = await createConnection();
    const conversation = await createConversation(connection.id, {
      phone: '+14076390665',
      phoneNormalized: '14076390665',
      phoneE164: '+14076390665',
    });
    const requestId = unique('PHONE-OUTBOUND-TEXT1-REQUEST');
    const data = {
      conversationId: conversation.id,
      whatsAppConnectionId: connection.id,
      provider: 'KIRAGO' as const,
      requestId,
      direction: 'OUTBOUND' as const,
      type: 'TEXT' as const,
      text: 'Mensagem internacional simulada',
      status: 'PENDING' as const,
      isFromMe: true,
      rawMetadata: { source: 'manual_outbound_send' },
    };

    const attempts = await Promise.allSettled([
      prisma.whatsAppMessage.create({ data }),
      prisma.whatsAppMessage.create({ data }),
    ]);

    expect(attempts.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(
      await prisma.whatsAppMessage.count({
        where: { whatsAppConnectionId: connection.id, requestId },
      }),
    ).toBe(1);
    await expect(
      prisma.whatsAppConversation.findUniqueOrThrow({ where: { id: conversation.id } }),
    ).resolves.toMatchObject({
      phone: '+14076390665',
      phoneNormalized: '14076390665',
      phoneE164: '+14076390665',
    });
  });

  async function createConnection() {
    const connection = await prisma.whatsAppConnection.create({
      data: {
        name: unique('PHONE-WHATSAPP1-CONNECTION'),
        providerTokenEncrypted: unique('encrypted-token'),
      },
    });
    createdConnectionIds.add(connection.id);
    return connection;
  }

  async function createConversation(
    whatsAppConnectionId: string,
    input: {
      phone: string;
      phoneNormalized: string;
      phoneE164: string;
      lastMessagePreview?: string;
      unreadCount?: number;
    },
  ) {
    const conversation = await prisma.whatsAppConversation.create({
      data: {
        whatsAppConnectionId,
        ...input,
      },
    });
    createdConversationIds.add(conversation.id);
    return conversation;
  }
});

function unique(prefix: string) {
  return `${prefix}-${randomUUID()}`;
}
