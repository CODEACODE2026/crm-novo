/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { BillingTemplateRenderer } from '../billing/billing-template-renderer';
import { RecoveryService } from './recovery.service';

const userId = '22222222-2222-4222-8222-222222222222';
const baseClient = {
  id: 'client-1',
  name: 'Bruno Silva',
  phone: '(11) 99999-9999',
  phoneNormalized: '5511999999999',
  email: null,
  reference: 'bruno1499',
  planId: 'plan-1',
  recurringValue: new Prisma.Decimal(50),
  dueDate: new Date('2026-09-20T00:00:00.000Z'),
  billingAnchorDay: 20,
  billingNoticeDays: 3,
  notes: null,
  status: 'ATIVO' as const,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  plan: {
    id: 'plan-1',
    name: 'Mensal',
    durationMonths: 1,
    defaultValue: new Prisma.Decimal(50),
    active: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  },
};

function createService(
  provider = { sendText: vi.fn().mockResolvedValue({ providerMessageId: 'msg-1' }) },
) {
  const fake = createFakePrisma();
  const service = new RecoveryService(
    fake.prisma as never,
    provider as never,
    { decrypt: vi.fn(() => 'instance-token') } as never,
    { get: vi.fn((key: string) => (key === 'RECOVERY_SEND_HOUR' ? '9' : undefined)) } as never,
    new BillingTemplateRenderer(),
  );

  return { ...fake, provider, service };
}

function createFakePrisma() {
  const templates: Array<Record<string, unknown>> = [];
  const campaigns: Array<Record<string, unknown>> = [];
  const steps: Array<Record<string, unknown>> = [];
  const dispatches: Array<Record<string, unknown>> = [];
  const events: Array<Record<string, unknown>> = [];
  const connection = {
    id: 'connection-1',
    providerTokenEncrypted: 'encrypted',
    status: 'CONNECTED',
    connected: true,
    loggedIn: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };
  let id = 1;
  const nextId = (prefix: string) => `${prefix}-${id++}`;
  const includeCampaign = (campaign: Record<string, unknown>) => ({
    ...campaign,
    client: { ...baseClient, status: 'INATIVO' },
    steps: steps
      .filter((step) => step.campaignId === campaign.id)
      .map((step) => ({
        ...step,
        template: templates.find((template) => template.id === step.templateId) ?? null,
        dispatch: dispatches.find((dispatch) => dispatch.id === step.dispatchId) ?? null,
      })),
  });
  const includeDispatch = (dispatch: Record<string, unknown>) => {
    const campaign = campaigns.find((item) => item.id === dispatch.recoveryCampaignId) ?? null;
    const step = steps.find((item) => item.dispatchId === dispatch.id) ?? null;

    return {
      ...dispatch,
      client: { ...baseClient, status: 'INATIVO' },
      template: templates.find((template) => template.id === dispatch.templateId) ?? null,
      whatsAppConnection: connection,
      recoveryCampaign: campaign ? { ...campaign, steps } : null,
      recoveryStep: step ?? null,
    };
  };

  const tx = {
    messageTemplate: {
      upsert: vi.fn(async ({ where, create }) => {
        const existing = templates.find(
          (template) =>
            template.type === where.type_name.type && template.name === where.type_name.name,
        );

        if (existing) return existing;

        const template = {
          id: nextId('template'),
          ...create,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        templates.push(template);
        return template;
      }),
    },
    whatsAppConnection: {
      findFirst: vi.fn(async () => connection),
    },
    recoveryCampaign: {
      findFirst: vi.fn(
        async ({ where }) =>
          campaigns.find(
            (campaign) => campaign.clientId === where.clientId && campaign.status === where.status,
          ) ?? null,
      ),
      findMany: vi.fn(async ({ where }) =>
        campaigns.filter(
          (campaign) =>
            (!where.clientId || campaign.clientId === where.clientId) &&
            (!where.status || campaign.status === where.status),
        ),
      ),
      create: vi.fn(async ({ data }) => {
        const campaign = {
          id: nextId('campaign'),
          ...data,
          completedAt: null,
          canceledAt: null,
          cancelReason: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        campaigns.push(campaign);
        return campaign;
      }),
      update: vi.fn(async ({ where, data }) => {
        const campaign = campaigns.find((item) => item.id === where.id);
        if (!campaign) throw new Error('missing campaign');
        Object.assign(campaign, data, { updatedAt: new Date() });
        return campaign;
      }),
      findUnique: vi.fn(
        async ({ where }) => campaigns.find((item) => item.id === where.id) ?? null,
      ),
      count: vi.fn(
        async ({ where }) =>
          campaigns.filter((campaign) => !where.status || campaign.status === where.status).length,
      ),
    },
    recoveryCampaignStep: {
      create: vi.fn(async ({ data }) => {
        const step = {
          id: nextId('step'),
          ...data,
          sentAt: null,
          canceledAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        steps.push(step);
        return step;
      }),
      update: vi.fn(async ({ where, data }) => {
        const step = steps.find((item) => item.id === where.id);
        if (!step) throw new Error('missing step');
        Object.assign(step, data, { updatedAt: new Date() });
        return step;
      }),
      updateMany: vi.fn(async ({ where, data }) => {
        let count = 0;
        for (const step of steps) {
          const status = step.status as string;
          if (step.campaignId === where.campaignId && where.status.in.includes(status)) {
            Object.assign(step, data);
            count += 1;
          }
        }
        return { count };
      }),
      count: vi.fn(
        async ({ where }) =>
          steps.filter(
            (step) =>
              step.campaignId === where.campaignId &&
              (!where.status?.in || where.status.in.includes(step.status)),
          ).length,
      ),
    },
    messageDispatch: {
      create: vi.fn(async ({ data }) => {
        if (dispatches.some((dispatch) => dispatch.idempotencyKey === data.idempotencyKey)) {
          throw new Prisma.PrismaClientKnownRequestError('Unique', {
            code: 'P2002',
            clientVersion: 'test',
          });
        }
        const dispatch = {
          id: nextId('dispatch'),
          ...data,
          attempts: data.attempts ?? 0,
          providerMessageId: null,
          errorCode: null,
          errorMessage: null,
          sentAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        dispatches.push(dispatch);
        return dispatch;
      }),
      findMany: vi.fn(async ({ where, take }) =>
        dispatches
          .filter(
            (dispatch) =>
              dispatch.origin === where.origin &&
              where.status.in.includes(dispatch.status) &&
              Number(dispatch.attempts) < where.attempts.lt,
          )
          .slice(0, take),
      ),
      findUnique: vi.fn(async ({ where }) => {
        const dispatch = dispatches.find((item) => item.id === where.id);
        return dispatch ? includeDispatch(dispatch) : null;
      }),
      updateMany: vi.fn(async ({ where, data }) => {
        let count = 0;
        for (const dispatch of dispatches) {
          const status = dispatch.status as string;
          if (
            (!where.id || dispatch.id === where.id) &&
            (!where.recoveryCampaignId ||
              dispatch.recoveryCampaignId === where.recoveryCampaignId) &&
            dispatch.origin === where.origin &&
            where.status.in.includes(status)
          ) {
            const { attempts, ...rest } = data;
            Object.assign(dispatch, rest);
            if (data.attempts?.increment) {
              dispatch.attempts = Number(dispatch.attempts) + data.attempts.increment;
            }
            count += 1;
          }
        }
        return { count };
      }),
      update: vi.fn(async ({ where, data }) => {
        const dispatch = dispatches.find((item) => item.id === where.id);
        if (!dispatch) throw new Error('missing dispatch');
        Object.assign(dispatch, data, { updatedAt: new Date() });
        return includeDispatch(dispatch);
      }),
      count: vi.fn(
        async ({ where }) =>
          dispatches.filter(
            (dispatch) => dispatch.origin === where.origin && dispatch.status === where.status,
          ).length,
      ),
    },
    clientEvent: {
      create: vi.fn(async ({ data }) => {
        const event = { id: nextId('event'), ...data, createdAt: new Date() };
        events.push(event);
        return event;
      }),
      findFirst: vi.fn(
        async ({ where }) =>
          events.find(
            (event) =>
              (event.metadata as { messageDispatchId?: string } | undefined)?.messageDispatchId ===
              where.metadata.equals,
          ) ?? null,
      ),
    },
    $transaction: vi.fn(async (callback) => callback(tx)),
  };

  return {
    campaigns,
    dispatches,
    events,
    includeCampaign,
    prisma: tx,
    steps,
    templates,
    tx,
  };
}

describe('RecoveryService', () => {
  it('does not start a campaign when recovery is not requested', async () => {
    const { campaigns, dispatches, service, tx } = createService();

    await service.handleClientStatusChange(tx as never, baseClient, 'INATIVO', {
      actorUserId: userId,
      startRecovery: false,
    });

    expect(campaigns).toHaveLength(0);
    expect(dispatches).toHaveLength(0);
  });

  it('starts one campaign with four recovery steps and Sao Paulo schedule', async () => {
    const { campaigns, dispatches, events, service, steps, tx } = createService();

    await service.handleClientStatusChange(tx as never, baseClient, 'INATIVO', {
      actorUserId: userId,
      changedAt: new Date('2026-09-11T18:00:00.000Z'),
      startRecovery: true,
    });

    expect(campaigns).toHaveLength(1);
    expect(steps.map((step) => step.delayDays)).toEqual([3, 10, 15, 30]);
    expect(dispatches).toHaveLength(4);
    expect(steps.map((step) => (step.scheduledFor as Date).toISOString())).toEqual([
      '2026-09-14T12:00:00.000Z',
      '2026-09-21T12:00:00.000Z',
      '2026-09-26T12:00:00.000Z',
      '2026-10-11T12:00:00.000Z',
    ]);
    expect(dispatches.map((dispatch) => dispatch.idempotencyKey)).toEqual([
      `recovery:${baseClient.id}:${campaigns[0]!.id}:1`,
      `recovery:${baseClient.id}:${campaigns[0]!.id}:2`,
      `recovery:${baseClient.id}:${campaigns[0]!.id}:3`,
      `recovery:${baseClient.id}:${campaigns[0]!.id}:4`,
    ]);
    expect(events.at(-1)?.title).toBe('Campanha automatica de recuperacao iniciada.');
  });

  it('cancels an active campaign and only future dispatches on reactivation', async () => {
    const { campaigns, dispatches, service, steps, tx } = createService();
    await service.handleClientStatusChange(tx as never, baseClient, 'INATIVO', {
      startRecovery: true,
    });
    Object.assign(dispatches[0]!, { status: 'SENT', sentAt: new Date() });
    Object.assign(steps[0]!, { status: 'SENT', sentAt: new Date() });

    await service.handleClientStatusChange(
      tx as never,
      { ...baseClient, status: 'INATIVO' },
      'ATIVO',
      {
        actorUserId: userId,
      },
    );

    expect(campaigns[0]!.status).toBe('CANCELADA');
    expect(campaigns[0]!.cancelReason).toBe(
      'Campanha de recuperação encerrada após reativação do cliente.',
    );
    expect(dispatches[0]!.status).toBe('SENT');
    expect(dispatches.slice(1).map((dispatch) => dispatch.status)).toEqual([
      'CANCELED',
      'CANCELED',
      'CANCELED',
    ]);
  });

  it('cancels an active campaign when the client is canceled', async () => {
    const { campaigns, dispatches, service, tx } = createService();
    await service.handleClientStatusChange(tx as never, baseClient, 'INATIVO', {
      startRecovery: true,
    });

    await service.handleClientStatusChange(
      tx as never,
      { ...baseClient, status: 'INATIVO' },
      'CANCELADO',
      {
        actorUserId: userId,
      },
    );

    expect(campaigns[0]!.status).toBe('CANCELADA');
    expect(dispatches.every((dispatch) => dispatch.status === 'CANCELED')).toBe(true);
  });

  it('creates a new campaign after a future inactivation', async () => {
    const { campaigns, service, tx } = createService();
    await service.handleClientStatusChange(tx as never, baseClient, 'INATIVO', {
      startRecovery: true,
    });
    await service.handleClientStatusChange(
      tx as never,
      { ...baseClient, status: 'INATIVO' },
      'ATIVO',
    );
    await service.handleClientStatusChange(tx as never, baseClient, 'INATIVO', {
      startRecovery: true,
    });

    expect(campaigns).toHaveLength(2);
    expect(campaigns.map((campaign) => campaign.status)).toEqual(['CANCELADA', 'ATIVA']);
  });

  it('acquires a due recovery dispatch only once under concurrent processing', async () => {
    const { provider, service, tx } = createService();
    await service.handleClientStatusChange(tx as never, baseClient, 'INATIVO', {
      changedAt: new Date('2026-09-01T12:00:00.000Z'),
      startRecovery: true,
    });

    await Promise.all([
      service.processDue(new Date('2026-09-20T12:00:00.000Z'), 1),
      service.processDue(new Date('2026-09-20T12:00:00.000Z'), 1),
    ]);

    expect(provider.sendText).toHaveBeenCalledTimes(1);
  });

  it('marks exhausted provider failures without duplicating dispatches', async () => {
    const provider = { sendText: vi.fn().mockRejectedValue(new Error('token=abc secret=123')) };
    const { dispatches, service, tx } = createService(provider);
    await service.handleClientStatusChange(tx as never, baseClient, 'INATIVO', {
      changedAt: new Date('2026-09-01T12:00:00.000Z'),
      startRecovery: true,
    });
    dispatches[0]!.attempts = 2;

    await service.processDue(new Date('2026-09-20T12:00:00.000Z'));

    expect(dispatches).toHaveLength(4);
    expect(dispatches[0]!.status).toBe('FAILED');
    expect(dispatches[0]!.attempts).toBe(3);
    expect(dispatches[0]!.nextAttemptAt).toBeNull();
    expect(dispatches[0]!.errorMessage).toContain('token=[redacted]');
  });
});
