import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { WhatsAppQuickRepliesService } from './whatsapp-quick-replies.service';

const baseReply = {
  id: '99999999-9999-4999-8999-999999999999',
  label: 'PIX expirado',
  text: 'Esse PIX expirou.',
  isActive: true,
  sortOrder: 30,
  createdAt: new Date('2026-10-13T00:00:00.000Z'),
  updatedAt: new Date('2026-10-13T00:00:00.000Z'),
};

function service(prisma: Record<string, unknown>) {
  return new WhatsAppQuickRepliesService(prisma as never);
}

describe('WhatsAppQuickRepliesService', () => {
  it('lists admin replies with deterministic ordering', async () => {
    const prisma = {
      whatsAppQuickReply: {
        findMany: vi.fn().mockResolvedValue([baseReply]),
      },
    };

    await expect(service(prisma).listAdmin()).resolves.toEqual([
      {
        ...baseReply,
        createdAt: '2026-10-13T00:00:00.000Z',
        updatedAt: '2026-10-13T00:00:00.000Z',
      },
    ]);
    expect(prisma.whatsAppQuickReply.findMany).toHaveBeenCalledWith({
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }, { id: 'asc' }],
    });
  });

  it('lists only active replies for the inbox contract', async () => {
    const prisma = {
      whatsAppQuickReply: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: baseReply.id, label: baseReply.label, text: baseReply.text }]),
      },
    };

    await expect(service(prisma).listActiveForInbox()).resolves.toEqual([
      { id: baseReply.id, label: baseReply.label, text: baseReply.text },
    ]);
    expect(prisma.whatsAppQuickReply.findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }, { id: 'asc' }],
      select: { id: true, label: true, text: true },
    });
  });

  it('creates and trims replies', async () => {
    const prisma = {
      whatsAppQuickReply: {
        create: vi.fn().mockResolvedValue(baseReply),
      },
    };

    await service(prisma).create({
      label: '  PIX expirado  ',
      text: '  Esse PIX expirou.  ',
      isActive: true,
      sortOrder: 30,
    });

    expect(prisma.whatsAppQuickReply.create).toHaveBeenCalledWith({
      data: {
        label: 'PIX expirado',
        text: 'Esse PIX expirou.',
        isActive: true,
        sortOrder: 30,
      },
    });
  });

  it('updates active state and ordering without requiring text fields', async () => {
    const prisma = {
      whatsAppQuickReply: {
        findUnique: vi.fn().mockResolvedValue(baseReply),
        update: vi.fn().mockResolvedValue({ ...baseReply, isActive: false, sortOrder: 0 }),
      },
    };

    await expect(
      service(prisma).update(baseReply.id, { isActive: false, sortOrder: 0 }),
    ).resolves.toMatchObject({ isActive: false, sortOrder: 0 });
    expect(prisma.whatsAppQuickReply.update).toHaveBeenCalledWith({
      where: { id: baseReply.id },
      data: { isActive: false, sortOrder: 0 },
    });
  });

  it('rejects empty text and missing replies', async () => {
    await expect(
      service({
        whatsAppQuickReply: { create: vi.fn() },
      }).create({ label: '   ', text: 'Mensagem' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service({
        whatsAppQuickReply: { create: vi.fn() },
      }).create({ label: 'PIX', text: '   ' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service({
        whatsAppQuickReply: { findUnique: vi.fn().mockResolvedValue(null) },
      }).update(baseReply.id, { label: 'PIX' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
