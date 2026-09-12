import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PaymentProviderCredentialsService } from './payment-provider-credentials.service';

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */

function createService(apiProvider = 'fastflow') {
  const records: Array<Record<string, unknown>> = [];
  const prisma = {
    paymentProviderCredential: {
      findMany: vi.fn().mockResolvedValue(records),
      count: vi.fn(({ where }) =>
        Promise.resolve(
          records.filter(
            (record) =>
              record.active === where.active && record.defaultForPix === where.defaultForPix,
          ).length,
        ),
      ),
      updateMany: vi.fn(({ data }) => {
        records.forEach((record) => Object.assign(record, data));
        return Promise.resolve({ count: records.length });
      }),
      create: vi.fn(({ data }) => {
        const record = {
          id: `credential-${records.length + 1}`,
          createdAt: new Date('2026-09-11T00:00:00.000Z'),
          updatedAt: new Date('2026-09-11T00:00:00.000Z'),
          ...data,
        };
        records.push(record);
        return Promise.resolve(record);
      }),
      findFirst: vi.fn(({ where }) =>
        Promise.resolve(
          records.find(
            (record) => record.provider === where.provider && record.active === where.active,
          ) ?? null,
        ),
      ),
      update: vi.fn(({ where, data }) => {
        const record = records.find((item) => item.id === where.id);
        if (!record) throw new Error('credential not found');
        Object.assign(record, data, { updatedAt: new Date('2026-09-11T00:01:00.000Z') });
        return Promise.resolve(record);
      }),
    },
  };
  const encryption = {
    encrypt: vi.fn((value: string) => `encrypted:${value.slice(-4)}`),
    decrypt: vi.fn((value: string) => value.replace('encrypted:', 'token-')),
  };
  const apiClient = {
    authMe: vi.fn().mockResolvedValue({
      api_provider: apiProvider,
      provider_label: apiProvider,
      parceiro: { id: 'partner-id', name: 'Parceiro', email: 'ops@example.com' },
    }),
  };

  return {
    service: new PaymentProviderCredentialsService(
      prisma as never,
      encryption as never,
      apiClient as never,
      { get: () => undefined } as never,
    ),
    prisma,
    encryption,
    apiClient,
    records,
  };
}

describe('PaymentProviderCredentialsService', () => {
  it('saves encrypted FastFlow credentials and returns only a token mask', async () => {
    const fake = createService('fastflow');

    const result = await fake.service.save({
      provider: 'FASTFLOW',
      name: 'FastFlow principal',
      token: 'fdpx_live_token_A7F2',
    });

    expect(result).toMatchObject({
      provider: 'FASTFLOW',
      tokenMask: 'fdpx_************A7F2',
      status: 'VALIDO',
    });
    expect(fake.records.at(0)?.tokenEncrypted).toBe('encrypted:A7F2');
    expect(JSON.stringify(result)).not.toContain('fdpx_live_token_A7F2');
  });

  it('rejects a FastPay token when saving it in the FastFlow card', async () => {
    const fake = createService('fastpay');

    await expect(
      fake.service.save({
        provider: 'FASTFLOW',
        name: 'FastFlow errado',
        token: 'fdpx_live_token_A7F2',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(fake.records).toHaveLength(0);
  });
});
