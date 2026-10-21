import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { WhatsAppAttendanceService } from './whatsapp-attendance.service';

const runDatabaseTests = process.env.RUN_DATABASE_TESTS === '1';

describe.skipIf(!runDatabaseTests)('WhatsApp attendance category PostgreSQL removal', () => {
  const prisma = new PrismaClient();
  const service = new WhatsAppAttendanceService(prisma as never);
  const connectionIds = new Set<string>();

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterEach(async () => {
    const ids = [...connectionIds];
    await prisma.whatsAppAttendance.deleteMany({ where: { whatsAppConnectionId: { in: ids } } });
    await prisma.whatsAppMessage.deleteMany({ where: { whatsAppConnectionId: { in: ids } } });
    await prisma.whatsAppConversation.deleteMany({
      where: { whatsAppConnectionId: { in: ids } },
    });
    await prisma.whatsAppAttendanceCategory.deleteMany({
      where: { whatsAppConnectionId: { in: ids } },
    });
    await prisma.whatsAppConnection.deleteMany({ where: { id: { in: ids } } });
    connectionIds.clear();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('keeps a renamed default identity, id and inactive state across repeated seeds', async () => {
    const connection = await createConnection();
    await service.ensureDefaultCategories(connection.id);
    const before = await prisma.whatsAppAttendanceCategory.findUniqueOrThrow({
      where: {
        whatsAppConnectionId_systemKey: {
          whatsAppConnectionId: connection.id,
          systemKey: 'technical_support',
        },
      },
    });
    await service.updateCategory(connection.id, before.id, {
      name: 'Suporte premium',
      color: 'RED',
      sortOrder: 77,
    });
    await service.listCategories(connection.id);
    const renamed = await prisma.whatsAppAttendanceCategory.findUniqueOrThrow({
      where: { id: before.id },
    });
    expect(renamed).toMatchObject({
      id: before.id,
      systemKey: 'technical_support',
      name: 'Suporte premium',
      normalizedName: 'suporte premium',
      color: 'RED',
      sortOrder: 77,
      isActive: true,
    });
    await expect(
      prisma.whatsAppAttendanceCategory.count({
        where: { whatsAppConnectionId: connection.id, systemKey: 'technical_support' },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.whatsAppAttendanceCategory.count({
        where: { whatsAppConnectionId: connection.id, normalizedName: 'suporte técnico' },
      }),
    ).resolves.toBe(0);

    await expect(service.removeCategory(connection.id, before.id)).resolves.toMatchObject({
      deleted: false,
      deactivated: true,
    });
    const listed = await service.listCategories(connection.id);
    const after = listed.find((category) => category.id === before.id);

    expect(after).toMatchObject({
      id: before.id,
      systemKey: 'technical_support',
      name: 'Suporte premium',
      isActive: false,
    });
    expect(listed.filter((category) => category.systemKey === 'technical_support')).toHaveLength(1);

    await service.updateCategory(connection.id, before.id, { isActive: true });
    await service.listCategories(connection.id);
    await expect(
      prisma.whatsAppAttendanceCategory.findUniqueOrThrow({ where: { id: before.id } }),
    ).resolves.toMatchObject({ id: before.id, name: 'Suporte premium', isActive: true });
  });

  it('physically deletes an unused custom category and does not recreate it on listing', async () => {
    const connection = await createConnection();
    const category = await service.createCategory(connection.id, {
      name: `Custom ${randomUUID()}`,
      color: 'BLUE',
    });

    await expect(service.removeCategory(connection.id, category.id)).resolves.toEqual({
      deleted: true,
      deactivated: false,
      id: category.id,
    });
    await service.listCategories(connection.id);

    await expect(
      prisma.whatsAppAttendanceCategory.findUnique({ where: { id: category.id } }),
    ).resolves.toBeNull();
  });

  it('deactivates defaults and custom categories with history while preserving attendance links', async () => {
    const connection = await createConnection();
    await service.ensureDefaultCategories(connection.id);
    const defaultCategory = await prisma.whatsAppAttendanceCategory.findFirstOrThrow({
      where: { whatsAppConnectionId: connection.id, systemKey: 'finance_billing' },
    });
    const customCategory = await service.createCategory(connection.id, {
      name: `Historical ${randomUUID()}`,
      color: 'PURPLE',
    });
    const defaultAttendance = await createAttendance(connection.id, defaultCategory.id);
    const customAttendance = await createAttendance(connection.id, customCategory.id);

    await expect(service.removeCategory(connection.id, defaultCategory.id)).resolves.toMatchObject({
      deleted: false,
      deactivated: true,
    });
    await expect(service.removeCategory(connection.id, customCategory.id)).resolves.toMatchObject({
      deleted: false,
      deactivated: true,
    });
    await expect(
      prisma.whatsAppAttendance.findUniqueOrThrow({ where: { id: defaultAttendance.id } }),
    ).resolves.toMatchObject({ categoryId: defaultCategory.id });
    await expect(
      prisma.whatsAppAttendance.findUniqueOrThrow({ where: { id: customAttendance.id } }),
    ).resolves.toMatchObject({ categoryId: customCategory.id });
    await expect(
      prisma.whatsAppAttendanceCategory.findUniqueOrThrow({ where: { id: defaultCategory.id } }),
    ).resolves.toMatchObject({ isActive: false });
    await expect(
      prisma.whatsAppAttendanceCategory.findUniqueOrThrow({ where: { id: customCategory.id } }),
    ).resolves.toMatchObject({ isActive: false });
  });

  it('serializes custom deletion against concurrent attendance use without orphaning history', async () => {
    const connection = await createConnection();
    const category = await service.createCategory(connection.id, {
      name: `Race ${randomUUID()}`,
      color: 'RED',
    });
    const phone = `55${Date.now()}`;
    const conversation = await prisma.whatsAppConversation.create({
      data: {
        whatsAppConnectionId: connection.id,
        phone,
        phoneNormalized: phone,
      },
    });
    const message = await prisma.whatsAppMessage.create({
      data: {
        conversationId: conversation.id,
        whatsAppConnectionId: connection.id,
        direction: 'INBOUND',
        status: 'SENT',
        type: 'TEXT',
        text: 'Fixture concorrente',
      },
    });

    const [removal, usage] = await Promise.allSettled([
      service.removeCategory(connection.id, category.id),
      prisma.whatsAppAttendance.create({
        data: {
          conversationId: conversation.id,
          whatsAppConnectionId: connection.id,
          openedAt: new Date(),
          openedByMessageId: message.id,
          categoryId: category.id,
        },
      }),
    ]);
    const persistedCategory = await prisma.whatsAppAttendanceCategory.findUnique({
      where: { id: category.id },
    });
    const persistedAttendances = await prisma.whatsAppAttendance.count({
      where: { categoryId: category.id },
    });

    expect(removal.status).toBe('fulfilled');
    if (removal.status !== 'fulfilled') throw removal.reason;
    if (usage.status === 'fulfilled') {
      expect(removal.value).toMatchObject({ deleted: false, deactivated: true });
      expect(persistedCategory).toMatchObject({ id: category.id, isActive: false });
      expect(persistedAttendances).toBe(1);
    } else {
      expect(removal.value).toEqual({ deleted: true, deactivated: false, id: category.id });
      expect(persistedCategory).toBeNull();
      expect(persistedAttendances).toBe(0);
    }
  });

  it('rolls back all seed inserts when a custom category conflicts with a default name', async () => {
    const connection = await createConnection();
    const custom = await service.createCategory(connection.id, {
      name: 'Suporte técnico',
      color: 'PINK',
    });

    await expect(service.ensureDefaultCategories(connection.id)).rejects.toThrow(
      'conflito de nome',
    );
    const categories = await prisma.whatsAppAttendanceCategory.findMany({
      where: { whatsAppConnectionId: connection.id },
    });
    expect(categories).toEqual([
      expect.objectContaining({ id: custom.id, systemKey: null, name: 'Suporte técnico' }),
    ]);
  });

  it('provisions one complete default catalog under concurrent seed requests', async () => {
    const connection = await createConnection();

    await Promise.all([
      service.ensureDefaultCategories(connection.id),
      service.ensureDefaultCategories(connection.id),
      service.ensureDefaultCategories(connection.id),
    ]);

    const categories = await prisma.whatsAppAttendanceCategory.findMany({
      where: { whatsAppConnectionId: connection.id, systemKey: { not: null } },
      select: { systemKey: true },
    });
    expect(categories).toHaveLength(11);
    expect(new Set(categories.map(({ systemKey }) => systemKey)).size).toBe(11);
  });

  it('enforces systemKey uniqueness per connection while allowing separate connections', async () => {
    const first = await createConnection();
    const second = await createConnection();
    await prisma.whatsAppAttendanceCategory.create({
      data: {
        whatsAppConnectionId: first.id,
        systemKey: 'technical_support',
        name: 'Primeira',
        normalizedName: 'primeira',
        color: 'BLUE',
      },
    });

    await expect(
      prisma.whatsAppAttendanceCategory.create({
        data: {
          whatsAppConnectionId: first.id,
          systemKey: 'technical_support',
          name: 'Segunda',
          normalizedName: 'segunda',
          color: 'GREEN',
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
    await expect(
      prisma.whatsAppAttendanceCategory.create({
        data: {
          whatsAppConnectionId: second.id,
          systemKey: 'technical_support',
          name: 'Outra conexão',
          normalizedName: 'outra conexão',
          color: 'GREEN',
        },
      }),
    ).resolves.toMatchObject({ systemKey: 'technical_support' });
  });

  async function createConnection() {
    const connection = await prisma.whatsAppConnection.create({
      data: {
        name: `Category removal ${randomUUID()}`,
        providerTokenEncrypted: `test-token-${randomUUID()}`,
      },
    });
    connectionIds.add(connection.id);
    return connection;
  }

  async function createAttendance(whatsAppConnectionId: string, categoryId: string) {
    const phone = randomUUID();
    const conversation = await prisma.whatsAppConversation.create({
      data: { whatsAppConnectionId, phone, phoneNormalized: phone },
    });
    const message = await prisma.whatsAppMessage.create({
      data: {
        conversationId: conversation.id,
        whatsAppConnectionId,
        direction: 'INBOUND',
        status: 'SENT',
        type: 'TEXT',
        text: 'Fixture histórica',
      },
    });
    return prisma.whatsAppAttendance.create({
      data: {
        conversationId: conversation.id,
        whatsAppConnectionId,
        openedAt: new Date(),
        openedByMessageId: message.id,
        categoryId,
      },
    });
  }
});
