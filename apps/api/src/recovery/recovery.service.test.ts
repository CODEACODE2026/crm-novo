/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-base-to-string */
/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
import { randomUUID } from 'node:crypto';

import { Prisma, PrismaClient } from '@prisma/client';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { BillingTemplateRenderer } from '../billing/billing-template-renderer';
import { RecoveryService } from './recovery.service';

const plan = {
  id: 'plan-1',
  name: 'Mensal',
  durationMonths: 1,
  defaultValue: new Prisma.Decimal(50),
  active: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

const baseClient = {
  id: 'client-1',
  name: 'Bruno Silva',
  phone: '(11) 99999-9999',
  phoneNormalized: '5511999999999',
  email: null,
  reference: 'bruno1499',
  planId: plan.id,
  recurringValue: new Prisma.Decimal(50),
  dueDate: new Date('2026-09-20T00:00:00.000Z'),
  billingAnchorDay: 20,
  billingNoticeDays: 3,
  notes: null,
  status: 'ATIVO' as const,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  plan,
};

function reference(overrides: Record<string, unknown> = {}) {
  return {
    id: String(overrides.id ?? 'reference-1'),
    clientId: String(overrides.clientId ?? baseClient.id),
    reference: String(overrides.reference ?? 'bruno1499-a'),
    planId: plan.id,
    recurringValue: new Prisma.Decimal(50),
    dueDate: new Date('2026-09-10T00:00:00.000Z'),
    billingAnchorDay: 10,
    billingNoticeDays: 3,
    status: (overrides.status ?? 'ATIVO') as 'ATIVO' | 'INATIVO' | 'CANCELADO',
    notes: null,
    inactivatedAt: null,
    inactivationReason: null,
    inactivatedByUserId: null,
    canceledAt: null,
    cancellationReason: null,
    canceledByUserId: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    client: baseClient,
    plan,
    ...overrides,
  };
}

function receivable(overrides: Record<string, unknown> = {}) {
  const nextReference = (overrides.clientReference as ReturnType<typeof reference>) ?? reference();

  return {
    id: String(overrides.id ?? 'receivable-1'),
    clientId: nextReference.clientId,
    clientReferenceId: nextReference.id,
    renewalId: null,
    purpose: 'RENEWAL' as const,
    description: 'Mensalidade',
    amount: new Prisma.Decimal(50),
    dueDate: new Date('2026-09-10T00:00:00.000Z'),
    status: (overrides.status ?? 'PENDENTE') as 'PENDENTE' | 'PAGO' | 'CANCELADO',
    paidAt: null,
    canceledAt: null,
    cancelReason: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    client: baseClient,
    clientReference: nextReference,
    ...overrides,
  };
}

function createService(
  input: {
    receivables?: Array<ReturnType<typeof receivable>>;
    provider?: { sendText: ReturnType<typeof vi.fn> };
    settings?: Partial<Record<string, unknown>>;
  } = {},
) {
  const templates: Array<Record<string, unknown>> = [
    {
      id: 'template-1',
      type: 'RECOVERY_DAY_3',
      name: 'Recuperação 3 dias',
      content:
        'Olá, {{primeiroNome}}! Tudo bem? Identificamos que o pagamento referente à sua referência {{referencia}}, no valor de {{valor}}, venceu em {{vencimento}} e ainda consta como pendente. Se já realizou o pagamento, pode desconsiderar esta mensagem. Se precisar, estamos à disposição.',
      active: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    },
    {
      id: 'template-2',
      type: 'RECOVERY_DAY_7',
      name: 'Recuperação 7 dias',
      content:
        'Olá, {{primeiroNome}}. O pagamento da referência {{referencia}}, vencido em {{vencimento}}, ainda consta em aberto no valor de {{valor}}. Para evitar que a pendência continue, pedimos que regularize assim que possível. Se precisar de ajuda, fale conosco.',
      active: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    },
    {
      id: 'template-3',
      type: 'RECOVERY_DAY_15',
      name: 'Recuperação 15 dias',
      content:
        'Olá, {{primeiroNome}}. Sua referência {{referencia}} está com pagamento pendente há alguns dias. O valor em aberto é {{valor}}, com vencimento em {{vencimento}}. Pedimos que entre em contato conosco para regularizar a situação.',
      active: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    },
    {
      id: 'template-4',
      type: 'RECOVERY_DAY_30',
      name: 'Recuperação 30 dias',
      content:
        'Olá, {{primeiroNome}}. O pagamento da referência {{referencia}}, vencido em {{vencimento}}, continua pendente no valor de {{valor}}. Esta é uma notificação de cobrança referente à pendência em aberto. Entre em contato conosco para regularização.',
      active: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    },
  ];
  const campaigns: Array<Record<string, unknown>> = [];
  const steps: Array<Record<string, unknown>> = [];
  const dispatches: Array<Record<string, unknown>> = [];
  const events: Array<Record<string, unknown>> = [];
  const receivables = input.receivables ?? [receivable()];
  const recoverySettings = {
    id: 'recovery-settings-1',
    scope: 'global',
    enabled: false,
    sendTime: '09:00',
    timezone: 'America/Sao_Paulo',
    sendIntervalSeconds: 8,
    day3Enabled: true,
    day3OffsetDays: 3,
    day10Enabled: true,
    day10OffsetDays: 7,
    day15Enabled: true,
    day15OffsetDays: 15,
    day30Enabled: true,
    day30OffsetDays: 30,
    companyId: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...input.settings,
  };
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
  const includeCampaign = (campaign: Record<string, unknown>) => {
    const campaignReceivable = receivables.find((item) => item.id === campaign.receivableId)!;

    return {
      ...campaign,
      client: campaignReceivable.client,
      clientReference: campaignReceivable.clientReference,
      receivable: campaignReceivable,
      steps: steps
        .filter((step) => step.campaignId === campaign.id)
        .map((step) => ({
          ...step,
          template: templates.find((template) => template.id === step.templateId) ?? null,
          dispatch: dispatches.find((dispatch) => dispatch.id === step.dispatchId) ?? null,
        })),
    };
  };
  const includeDispatch = (dispatch: Record<string, unknown>) => {
    const campaign = campaigns.find((item) => item.id === dispatch.recoveryCampaignId) ?? null;
    const campaignReceivable =
      receivables.find((item) => item.id === dispatch.receivableId) ?? null;
    const step = steps.find((item) => item.dispatchId === dispatch.id) ?? null;

    return {
      ...dispatch,
      client: campaignReceivable?.client ?? baseClient,
      clientReference: campaignReceivable?.clientReference ?? null,
      receivable: campaignReceivable,
      template: templates.find((template) => template.id === dispatch.templateId) ?? null,
      whatsAppConnection: connection,
      recoveryCampaign: campaign ? { ...campaign, steps } : null,
      recoveryStep: step ?? null,
    };
  };

  const tx = {
    messageTemplate: {
      findMany: vi.fn(async ({ where }) => {
        const allowedTypes = where?.type?.in as string[] | undefined;

        return templates.filter((template) =>
          allowedTypes ? allowedTypes.includes(template.type as string) : true,
        );
      }),
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
    receivable: {
      findMany: vi.fn(async ({ where }) =>
        receivables.filter((item) => {
          if (where?.status && item.status !== where.status) return false;
          if (where?.clientId && item.clientId !== where.clientId) return false;
          if (where?.purpose && item.purpose !== where.purpose) return false;
          if (where?.dueDate?.lt && !(item.dueDate < where.dueDate.lt)) return false;
          const statuses = where?.clientReference?.status?.in as string[] | undefined;
          if (statuses && !statuses.includes(item.clientReference.status)) return false;
          return true;
        }),
      ),
      findFirst: vi.fn(
        async ({ where }) =>
          receivables.find(
            (item) =>
              (!where.clientId || item.clientId === where.clientId) &&
              (!where.purpose || item.purpose === where.purpose) &&
              (!where.status || item.status === where.status),
          ) ?? null,
      ),
    },
    recoveryAutomationSettings: {
      upsert: vi.fn(async ({ create, update }) => {
        if (!recoverySettings.id) {
          Object.assign(recoverySettings, create);
        }
        Object.assign(recoverySettings, update);
        return recoverySettings;
      }),
      update: vi.fn(async ({ data }) => {
        Object.assign(recoverySettings, data, { updatedAt: new Date() });
        return recoverySettings;
      }),
    },
    whatsAppConnection: {
      findFirst: vi.fn(async () => connection),
    },
    whatsAppConversation: {
      findFirst: vi.fn(async () => ({ id: 'conversation-1', whatsAppConnection: connection })),
    },
    recoveryCampaign: {
      findFirst: vi.fn(
        async ({ where }) =>
          campaigns.find((campaign) => {
            if (where.receivableId && campaign.receivableId !== where.receivableId) return false;
            if (where.clientId && campaign.clientId !== where.clientId) return false;
            return campaign.status === where.status;
          }) ?? null,
      ),
      findMany: vi.fn(async ({ where }) =>
        campaigns
          .filter((campaign) => {
            if (where.receivableId && campaign.receivableId !== where.receivableId) return false;
            if (where.clientId && campaign.clientId !== where.clientId) return false;
            if (where.clientReferenceId && campaign.clientReferenceId !== where.clientReferenceId) {
              return false;
            }
            if (where.status && campaign.status !== where.status) return false;
            return true;
          })
          .map(includeCampaign),
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
      findUnique: vi.fn(async ({ where }) => {
        const campaign = campaigns.find((item) => item.id === where.id);
        return campaign ? includeCampaign(campaign) : null;
      }),
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
          .filter((dispatch) => {
            if (dispatch.origin !== where.origin) return false;
            if (!where.status.in.includes(dispatch.status)) return false;
            if (Number(dispatch.attempts) >= where.attempts.lt) return false;
            const scheduledFor = dispatch.scheduledFor as Date;
            const nextAttemptAt = dispatch.nextAttemptAt as Date | null;

            if (where.scheduledFor?.lte && scheduledFor > where.scheduledFor.lte) {
              return false;
            }
            if (where.OR && nextAttemptAt && nextAttemptAt > where.OR[1].nextAttemptAt.lte) {
              return false;
            }
            const blockedErrorCodes = where.AND?.[0]?.OR?.[1]?.errorCode?.notIn as
              string[] | undefined;
            if (blockedErrorCodes?.includes(String(dispatch.errorCode))) return false;
            return true;
          })
          .sort((a, b) => Number(a.scheduledFor) - Number(b.scheduledFor))
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
            where.status.in.includes(status) &&
            !(where.AND?.[0]?.OR?.[1]?.errorCode?.notIn as string[] | undefined)?.includes(
              String(dispatch.errorCode),
            )
          ) {
            const { attempts, ...rest } = data;
            Object.assign(dispatch, rest);
            if (attempts?.increment) {
              dispatch.attempts = Number(dispatch.attempts) + attempts.increment;
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
          dispatches.filter((dispatch) => {
            if (dispatch.origin !== where.origin) return false;
            const statuses = where.status?.in ?? [where.status];
            if (where.status && !statuses.includes(dispatch.status)) return false;
            if (where.id?.not && dispatch.id === where.id.not) return false;
            const scheduledFor = dispatch.scheduledFor as Date;

            if (where.scheduledFor?.gte && scheduledFor < where.scheduledFor.gte) {
              return false;
            }
            if (where.scheduledFor?.lt && scheduledFor >= where.scheduledFor.lt) {
              return false;
            }
            return true;
          }).length,
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
    $transaction: vi.fn(async (input) => (Array.isArray(input) ? Promise.all(input) : input(tx))),
  };

  const provider = input.provider ?? {
    sendText: vi.fn().mockResolvedValue({ providerMessageId: 'msg-1' }),
  };
  const service = new RecoveryService(
    tx as never,
    provider as never,
    { decrypt: vi.fn(() => 'instance-token') } as never,
    { get: vi.fn((key: string) => (key === 'RECOVERY_SEND_HOUR' ? '9' : undefined)) } as never,
    new BillingTemplateRenderer(),
  );

  return {
    campaigns,
    dispatches,
    events,
    provider,
    receivables,
    service,
    settings: recoverySettings,
    steps,
    templates,
    tx,
  };
}

describe('RecoveryService', () => {
  it.each([
    [
      'canonical international identity',
      { phone: '+44 7911 123456', phoneNormalized: '447911123456', phoneE164: '+447911123456' },
      true,
    ],
    [
      'legacy-corrupted international identity',
      { phone: '+1 (407) 639-0665', phoneNormalized: '5514076390665', phoneE164: null },
      false,
    ],
  ])('applies global identity validation to a %s', async (_label, phoneOverrides, allowed) => {
    const foreignClient = { ...baseClient, ...phoneOverrides };
    const foreignReference = reference({ client: foreignClient });
    const foreignReceivable = receivable({
      client: foreignClient,
      clientReference: foreignReference,
    });
    const { campaigns, dispatches, events, provider, service, steps } = createService({
      receivables: [foreignReceivable],
    });

    await service.reconcile();

    expect(campaigns).toHaveLength(allowed ? 1 : 0);
    expect(steps).toHaveLength(allowed ? 4 : 0);
    expect(dispatches).toHaveLength(allowed ? 4 : 0);
    expect(events).toHaveLength(allowed ? 1 : 0);
    expect(provider.sendText).not.toHaveBeenCalled();
  });

  it('blocks an already scheduled recovery when the recipient identity changes', async () => {
    const testClient = { ...baseClient };
    const testReference = reference({ client: testClient });
    const testReceivable = receivable({ client: testClient, clientReference: testReference });
    const { dispatches, provider, service } = createService({ receivables: [testReceivable] });
    await service.reconcile();
    expect(dispatches.length).toBeGreaterThan(0);

    Object.assign(testClient, {
      phone: '+54 9 11 2345-6789',
      phoneNormalized: '5491123456789',
      phoneE164: '+5491123456789',
    });
    await service.processDue(new Date('2026-09-20T12:00:00.000Z'));

    expect(provider.sendText).not.toHaveBeenCalled();
    expect(dispatches[0]).toMatchObject({
      status: 'IGNORED',
      errorCode: 'PHONE_IDENTITY_MISMATCH',
    });
  });

  it('revalidates the client after resolving the connection and blocks a concurrent phone change', async () => {
    const testClient = { ...baseClient };
    const testReference = reference({ client: testClient });
    const testReceivable = receivable({ client: testClient, clientReference: testReference });
    const { dispatches, provider, service, tx } = createService({ receivables: [testReceivable] });
    await service.reconcile();
    expect(dispatches.length).toBeGreaterThan(0);

    tx.whatsAppConnection.findFirst.mockImplementationOnce(() => {
      Object.assign(testClient, {
        phone: '+44 7911 123456',
        phoneNormalized: '447911123456',
        phoneE164: '+447911123456',
      });
      return Promise.resolve({
        id: 'connection-1',
        providerTokenEncrypted: 'encrypted',
        status: 'CONNECTED',
        connected: true,
        loggedIn: true,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });
    });

    await service.processDue(new Date('2026-09-20T12:00:00.000Z'));

    expect(provider.sendText).not.toHaveBeenCalled();
    expect(dispatches[0]).toMatchObject({
      status: 'IGNORED',
      errorCode: 'PHONE_IDENTITY_MISMATCH',
    });
  });

  it('preserves an active campaign that becomes international without changing its receivable', async () => {
    const testClient = { ...baseClient };
    const testReference = reference({ client: testClient });
    const testReceivable = receivable({ client: testClient, clientReference: testReference });
    const { campaigns, dispatches, events, provider, service } = createService({
      receivables: [testReceivable],
    });
    await service.reconcile();

    Object.assign(testClient, {
      phone: '+351 912 345 678',
      phoneNormalized: '351912345678',
      phoneE164: '+351912345678',
    });
    await service.reconcile();

    expect(campaigns[0]).toMatchObject({
      status: 'ATIVA',
      cancelReason: null,
    });
    expect(dispatches.every((dispatch) => dispatch.status === 'SCHEDULED')).toBe(true);
    expect(testReceivable).toMatchObject({ status: 'PENDENTE', amount: new Prisma.Decimal(50) });
    expect(events).not.toContainEqual(
      expect.objectContaining({ type: 'RECOVERY_CAMPAIGN_CANCELED' }),
    );
    expect(provider.sendText).not.toHaveBeenCalled();
  });

  it('starts recovery from overdue receivable dueDate with default D+3/D+7/D+15/D+30 steps', async () => {
    vi.setSystemTime(new Date('2026-09-14T12:00:00.000Z'));
    const { campaigns, dispatches, service, steps } = createService();

    await service.reconcile();

    expect(campaigns).toHaveLength(1);
    expect(campaigns[0]).toMatchObject({
      clientId: baseClient.id,
      clientReferenceId: 'reference-1',
      receivableId: 'receivable-1',
      startedAt: new Date('2026-09-10T00:00:00.000Z'),
      status: 'ATIVA',
    });
    expect(steps.map((step) => step.delayDays)).toEqual([3, 7, 15, 30]);
    expect(steps.map((step) => step.templateId)).toEqual([
      'template-1',
      'template-2',
      'template-3',
      'template-4',
    ]);
    expect(dispatches.map((dispatch) => dispatch.templateId)).toEqual([
      'template-1',
      'template-2',
      'template-3',
      'template-4',
    ]);
    expect(dispatches.map((dispatch) => dispatch.renderedContent)).toEqual([
      expect.stringContaining('venceu em 10/09/2026'),
      expect.stringContaining('ainda consta em aberto no valor de R$'),
      expect.stringContaining('pagamento pendente há alguns dias'),
      expect.stringContaining('notificação de cobrança referente à pendência em aberto'),
    ]);
    expect(dispatches[0]?.renderedContent).toContain('bruno1499');
    expect(dispatches[0]?.renderedContent).toContain('R$');
    expect(steps.map((step) => (step.scheduledFor as Date).toISOString())).toEqual([
      '2026-09-13T12:00:00.000Z',
      '2026-09-17T12:00:00.000Z',
      '2026-09-25T12:00:00.000Z',
      '2026-10-10T12:00:00.000Z',
    ]);
    expect(dispatches.map((dispatch) => dispatch.receivableId)).toEqual([
      'receivable-1',
      'receivable-1',
      'receivable-1',
      'receivable-1',
    ]);
    vi.useRealTimers();
  });

  it('marks an inactive template step as ignored and continues the campaign', async () => {
    vi.setSystemTime(new Date('2026-09-20T12:00:00.000Z'));
    const { dispatches, service, steps, templates } = createService();
    const day7Template = templates.find((template) => template.type === 'RECOVERY_DAY_7');

    if (day7Template) {
      day7Template.active = false;
    }

    await service.reconcile();
    await service.reconcile();

    const day7Step = steps.find((step) => step.stepNumber === 2);

    expect(day7Step).toMatchObject({ status: 'IGNORED' });
    expect(dispatches.map((dispatch) => dispatch.templateId)).toEqual([
      'template-1',
      'template-3',
      'template-4',
    ]);
    vi.useRealTimers();
  });

  it('preserves rendered dispatch snapshots when templates are edited later', async () => {
    vi.setSystemTime(new Date('2026-09-20T12:00:00.000Z'));
    const { dispatches, service, templates } = createService();

    await service.reconcile();

    const firstDispatch = dispatches[0]!;
    const firstSnapshot = firstDispatch.renderedContent;
    const secondSnapshot = dispatches[1]?.renderedContent;
    dispatches[0] = {
      ...firstDispatch,
      status: 'SENT',
      renderedContent: 'snapshot enviado preservado',
      body: 'snapshot enviado preservado',
    };

    const day3Template = templates.find((template) => template.type === 'RECOVERY_DAY_3');
    const day7Template = templates.find((template) => template.type === 'RECOVERY_DAY_7');

    if (day3Template) {
      day3Template.content = 'Mensagem D+3 editada {{primeiroNome}}';
    }
    if (day7Template) {
      day7Template.content = 'Mensagem D+7 editada {{primeiroNome}}';
    }

    await service.reconcile();

    expect(firstSnapshot).not.toBe('snapshot enviado preservado');
    expect(dispatches[0]?.renderedContent).toBe('snapshot enviado preservado');
    expect(dispatches[1]?.renderedContent).toBe(secondSnapshot);
  });

  it('does not start recovery when a reference is inactivated without overdue debt', async () => {
    vi.setSystemTime(new Date('2026-09-14T12:00:00.000Z'));
    const { campaigns, service, tx } = createService({
      receivables: [receivable({ dueDate: new Date('2026-09-20T00:00:00.000Z') })],
    });

    await service.handleClientReferenceStatusChange(
      tx as never,
      reference({ status: 'ATIVO' }) as never,
      'INATIVO',
    );
    await service.reconcile();

    expect(campaigns).toHaveLength(0);
    vi.useRealTimers();
  });

  it('keeps active and inactive overdue references eligible, but blocks canceled references', async () => {
    vi.setSystemTime(new Date('2026-09-20T12:00:00.000Z'));
    const activeRef = reference({ id: 'ref-active', reference: 'active', status: 'ATIVO' });
    const inactiveRef = reference({ id: 'ref-inactive', reference: 'inactive', status: 'INATIVO' });
    const canceledRef = reference({
      id: 'ref-canceled',
      reference: 'canceled',
      status: 'CANCELADO',
    });
    const { campaigns, service } = createService({
      receivables: [
        receivable({ id: 'rec-active', clientReference: activeRef }),
        receivable({ id: 'rec-inactive', clientReference: inactiveRef }),
        receivable({ id: 'rec-canceled', clientReference: canceledRef }),
      ],
    });

    await service.reconcile();

    expect(campaigns.map((campaign) => campaign.receivableId)).toEqual([
      'rec-active',
      'rec-inactive',
    ]);
    vi.useRealTimers();
  });

  it('does not start recovery for manual initial activation while reference awaits payment', async () => {
    vi.setSystemTime(new Date('2026-09-20T12:00:00.000Z'));
    const pendingReference = reference({
      id: 'ref-pending-initial',
      reference: 'pending-initial',
      status: 'PENDENTE_PAGAMENTO',
    });
    const { campaigns, dispatches, service } = createService({
      receivables: [
        receivable({
          id: 'rec-pending-initial',
          clientReference: pendingReference,
          purpose: 'INITIAL_ACTIVATION',
          dueDate: new Date('2026-09-10T00:00:00.000Z'),
        }),
      ],
    });

    await service.reconcile();

    expect(campaigns).toHaveLength(0);
    expect(dispatches).toHaveLength(0);
    vi.useRealTimers();
  });

  it('does not start recovery for manual charge receivables', async () => {
    vi.setSystemTime(new Date('2026-09-20T12:00:00.000Z'));
    const { campaigns, dispatches, service } = createService({
      receivables: [
        receivable({
          id: 'rec-manual-charge',
          clientId: null,
          clientReferenceId: null,
          client: null,
          clientReference: null,
          purpose: 'MANUAL_CHARGE',
          dueDate: new Date('2026-09-10T00:00:00.000Z'),
        }),
      ],
    });

    await service.reconcile();

    expect(campaigns).toHaveLength(0);
    expect(dispatches).toHaveLength(0);
    vi.useRealTimers();
  });

  it('keeps two references independent and reconciles idempotently per receivable', async () => {
    vi.setSystemTime(new Date('2026-09-20T12:00:00.000Z'));
    const overdueA = reference({ id: 'ref-a', reference: 'A' });
    const currentB = reference({
      id: 'ref-b',
      reference: 'B',
      dueDate: new Date('2026-09-25T00:00:00.000Z'),
    });
    const { campaigns, dispatches, service } = createService({
      receivables: [
        receivable({ id: 'rec-a', clientReference: overdueA }),
        receivable({
          id: 'rec-b',
          clientReference: currentB,
          dueDate: new Date('2026-09-25T00:00:00.000Z'),
        }),
      ],
    });

    await service.reconcile();
    await service.reconcile();

    expect(campaigns).toHaveLength(1);
    expect(campaigns[0]!.receivableId).toBe('rec-a');
    expect(dispatches).toHaveLength(4);
    vi.useRealTimers();
  });

  it('creates independent campaigns when two receivables are overdue', async () => {
    vi.setSystemTime(new Date('2026-09-20T12:00:00.000Z'));
    const refA = reference({ id: 'ref-a', reference: 'A' });
    const refB = reference({ id: 'ref-b', reference: 'B' });
    const { campaigns, service } = createService({
      receivables: [
        receivable({ id: 'rec-a', clientReference: refA }),
        receivable({ id: 'rec-b', clientReference: refB }),
      ],
    });

    await service.reconcile();

    expect(campaigns.map((campaign) => campaign.receivableId)).toEqual(['rec-a', 'rec-b']);
    vi.useRealTimers();
  });

  it('cancels only future recovery when a receivable is paid and creates a new campaign for next cycle', async () => {
    vi.setSystemTime(new Date('2026-09-20T12:00:00.000Z'));
    const september = receivable({ id: 'rec-september' });
    const { campaigns, dispatches, receivables, service, steps, tx } = createService({
      receivables: [september],
    });
    await service.reconcile();
    Object.assign(dispatches[0]!, { status: 'SENT', sentAt: new Date() });
    Object.assign(steps[0]!, { status: 'SENT', sentAt: new Date() });
    september.status = 'PAGO';

    await service.cancelActiveForReceivable(
      tx as never,
      september.id,
      'RECEIVABLE_PAID',
      'Conta a receber paga durante campanha de recuperacao.',
    );
    receivables.push(
      receivable({ id: 'rec-october', dueDate: new Date('2026-10-10T00:00:00.000Z') }),
    );
    vi.setSystemTime(new Date('2026-10-14T12:00:00.000Z'));
    await service.reconcile();

    expect(campaigns.map((campaign) => campaign.status)).toEqual(['CONCLUIDA', 'ATIVA']);
    expect(dispatches[0]!.status).toBe('SENT');
    expect(dispatches.slice(1, 4).map((dispatch) => dispatch.status)).toEqual([
      'CANCELED',
      'CANCELED',
      'CANCELED',
    ]);
    expect(campaigns[1]!.receivableId).toBe('rec-october');
    vi.useRealTimers();
  });

  it('cancels future recovery when the reference is canceled', async () => {
    vi.setSystemTime(new Date('2026-09-20T12:00:00.000Z'));
    const nextReference = reference({ status: 'ATIVO' });
    const { campaigns, dispatches, service } = createService({
      receivables: [receivable({ clientReference: nextReference })],
    });
    await service.reconcile();
    nextReference.status = 'CANCELADO';

    await service.reconcile();

    expect(campaigns[0]!.status).toBe('CANCELADA');
    expect(dispatches.every((dispatch) => dispatch.status === 'CANCELED')).toBe(true);
    vi.useRealTimers();
  });

  it('automatic processing and failed retries send at most one message per tick', async () => {
    vi.setSystemTime(new Date('2026-09-20T12:00:00.000Z'));
    const { dispatches, provider, service, settings } = createService({
      settings: { enabled: true },
    });
    await service.reconcile();

    await service.processDue(new Date('2026-09-20T12:00:00.000Z'), 20, { automatic: true });

    expect(provider.sendText).toHaveBeenCalledTimes(1);
    dispatches[1]!.status = 'FAILED';
    dispatches[1]!.nextAttemptAt = new Date('2026-09-20T12:00:00.000Z');
    dispatches[2]!.status = 'FAILED';
    dispatches[2]!.nextAttemptAt = new Date('2026-09-20T12:00:00.000Z');
    settings.enabled = true;

    await service.processDue(new Date('2026-09-20T12:00:00.000Z'), 20, { automatic: true });

    expect(provider.sendText).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it.each([
    ['timeout after remote acceptance', 'KIRAGO_TIMEOUT'],
    ['socket reset after remote acceptance', 'KIRAGO_UNAVAILABLE'],
    ['HTTP 500 after remote acceptance', 'WHATSAPP_PROVIDER_ERROR'],
    ['unknown transport outcome after remote acceptance', 'UNCLASSIFIED_PROVIDER_FAILURE'],
  ])('blocks every resend after %s', async (message, code) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-20T12:00:00.000Z'));
    let remotePosts = 0;
    const provider = {
      sendText: vi.fn(async () => {
        remotePosts += 1;
        throw Object.assign(new Error(message), {
          code,
        });
      }),
    };
    const { dispatches, service, tx } = createService({ provider, settings: { enabled: true } });
    await service.reconcile();
    for (const dispatch of dispatches.slice(1)) {
      dispatch.scheduledFor = new Date('2026-12-20T12:00:00.000Z');
      dispatch.nextAttemptAt = dispatch.scheduledFor;
    }

    await service.processDue(new Date('2026-09-20T12:00:00.000Z'), 20, { automatic: true });
    const uncertain = dispatches.find(
      (dispatch) => dispatch.errorCode === 'PROVIDER_RESULT_UNCERTAIN',
    );

    expect(remotePosts).toBe(1);
    expect(uncertain).toMatchObject({ status: 'FAILED', nextAttemptAt: null });

    const restartedService = new RecoveryService(
      tx as never,
      provider as never,
      { decrypt: vi.fn(() => 'instance-token') } as never,
      { get: vi.fn((key: string) => (key === 'RECOVERY_SEND_HOUR' ? '9' : undefined)) } as never,
      new BillingTemplateRenderer(),
    );
    await Promise.all([
      restartedService.processDue(new Date('2026-09-21T12:00:00.000Z'), 20, {
        automatic: true,
      }),
      restartedService.processDue(new Date('2026-09-21T12:00:00.000Z'), 20, {
        automatic: true,
      }),
    ]);
    await restartedService.processDue(new Date('2026-09-22T12:00:00.000Z'));

    expect(remotePosts).toBe(1);
    expect(provider.sendText).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('keeps retry for a provider rejection that proves the message was not accepted', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-20T12:00:00.000Z'));
    let acceptedRemotePosts = 0;
    const provider = {
      sendText: vi
        .fn()
        .mockRejectedValueOnce(
          Object.assign(new Error('instance authentication rejected before acceptance'), {
            code: 'KIRAGO_INSTANCE_AUTH_FAILED',
          }),
        )
        .mockImplementationOnce(async () => {
          acceptedRemotePosts += 1;
          return { providerMessageId: 'remote-after-safe-retry' };
        }),
    };
    const { dispatches, service } = createService({ provider, settings: { enabled: true } });
    await service.reconcile();
    for (const dispatch of dispatches.slice(1)) {
      dispatch.scheduledFor = new Date('2026-12-20T12:00:00.000Z');
      dispatch.nextAttemptAt = dispatch.scheduledFor;
    }

    await service.processDue(new Date('2026-09-20T12:00:00.000Z'), 20, { automatic: true });
    const retryable = dispatches.find((dispatch) => dispatch.errorCode === 'PROVIDER_ERROR');
    expect(retryable).toMatchObject({
      status: 'FAILED',
      nextAttemptAt: new Date('2026-09-20T12:15:00.000Z'),
    });

    await service.processDue(new Date('2026-09-20T12:16:00.000Z'), 20, { automatic: true });

    expect(provider.sendText).toHaveBeenCalledTimes(2);
    expect(acceptedRemotePosts).toBe(1);
    expect(retryable).toMatchObject({
      status: 'SENT',
      providerMessageId: 'remote-after-safe-retry',
    });
    vi.useRealTimers();
  });

  it('blocks retry when KiraGo returns without a provider message id', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-20T12:00:00.000Z'));
    const provider = { sendText: vi.fn().mockResolvedValue({ providerMessageId: '' }) };
    const { dispatches, service } = createService({ provider, settings: { enabled: true } });
    await service.reconcile();
    for (const dispatch of dispatches.slice(1)) {
      dispatch.scheduledFor = new Date('2026-12-20T12:00:00.000Z');
      dispatch.nextAttemptAt = dispatch.scheduledFor;
    }

    await service.processDue(new Date('2026-09-20T12:00:00.000Z'), 20, { automatic: true });
    await service.processDue(new Date('2026-09-21T12:00:00.000Z'), 20, { automatic: true });

    expect(provider.sendText).toHaveBeenCalledTimes(1);
    expect(dispatches).toContainEqual(
      expect.objectContaining({
        status: 'FAILED',
        errorCode: 'PROVIDER_CONFIRMATION_MISSING',
        nextAttemptAt: null,
      }),
    );
    vi.useRealTimers();
  });

  it('preserves a confirmed provider id and blocks retry after local persistence fails', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-20T12:00:00.000Z'));
    const provider = {
      sendText: vi.fn().mockResolvedValue({ providerMessageId: 'remote-confirmed-1' }),
    };
    const { dispatches, service, tx } = createService({ provider, settings: { enabled: true } });
    await service.reconcile();
    for (const dispatch of dispatches.slice(1)) {
      dispatch.scheduledFor = new Date('2026-12-20T12:00:00.000Z');
      dispatch.nextAttemptAt = dispatch.scheduledFor;
    }
    const originalUpdate = tx.messageDispatch.update.getMockImplementation()!;
    tx.messageDispatch.update.mockImplementation(async (input: { data: { status?: string } }) => {
      if (input.data.status === 'SENT') throw new Error('database unavailable after send');
      return originalUpdate(input);
    });

    await service.processDue(new Date('2026-09-20T12:00:00.000Z'), 20, { automatic: true });
    await service.processDue(new Date('2026-09-21T12:00:00.000Z'), 20, { automatic: true });

    expect(provider.sendText).toHaveBeenCalledTimes(1);
    expect(dispatches).toContainEqual(
      expect.objectContaining({
        status: 'FAILED',
        providerMessageId: 'remote-confirmed-1',
        errorCode: 'PROVIDER_PERSISTENCE_UNCERTAIN',
        nextAttemptAt: null,
      }),
    );
    vi.useRealTimers();
  });

  it.each([
    'PROVIDER_RESULT_UNCERTAIN',
    'PROVIDER_CONFIRMATION_MISSING',
    'PROVIDER_PERSISTENCE_UNCERTAIN',
  ])('does not reactivate %s while reconciling a changed schedule', async (errorCode) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-20T12:00:00.000Z'));
    const provider = {
      sendText: vi.fn().mockResolvedValue({ providerMessageId: 'must-not-be-sent' }),
    };
    const { dispatches, service, steps, tx } = createService({
      provider,
      settings: { enabled: true },
    });
    await service.reconcile();

    const uncertain = dispatches[0]!;
    const original = {
      id: uncertain.id,
      scheduledFor: uncertain.scheduledFor,
      requestId: uncertain.requestId,
      idempotencyKey: uncertain.idempotencyKey,
      providerMessageId: 'remote-message-preserved',
    };
    Object.assign(uncertain, {
      status: 'FAILED',
      errorCode,
      errorMessage: 'Resultado remoto permanece incerto.',
      nextAttemptAt: null,
      providerMessageId: original.providerMessageId,
    });
    for (let index = 1; index < dispatches.length; index += 1) {
      dispatches[index]!.status = 'CANCELED';
      steps[index]!.status = 'CANCELED';
    }

    await service.updateSettings({
      sendTime: '10:30',
      day3OffsetDays: 4,
      day10OffsetDays: 11,
      day15OffsetDays: 16,
      day30OffsetDays: 31,
    });

    expect(dispatches).toHaveLength(4);
    expect(uncertain).toMatchObject({
      ...original,
      status: 'FAILED',
      errorCode,
      errorMessage: 'Resultado remoto permanece incerto.',
      nextAttemptAt: null,
    });

    const restartedService = new RecoveryService(
      tx as never,
      provider as never,
      { decrypt: vi.fn(() => 'instance-token') } as never,
      { get: vi.fn((key: string) => (key === 'RECOVERY_SEND_HOUR' ? '9' : undefined)) } as never,
      new BillingTemplateRenderer(),
    );
    await Promise.all([
      restartedService.processDue(new Date('2027-01-20T12:00:00.000Z'), 20, {
        automatic: true,
      }),
      restartedService.processDue(new Date('2027-01-20T12:00:00.000Z'), 20, {
        automatic: true,
      }),
    ]);
    await restartedService.processDue(new Date('2027-01-21T12:00:00.000Z'));

    expect(provider.sendText).not.toHaveBeenCalled();
    expect(uncertain).toMatchObject({
      ...original,
      status: 'FAILED',
      errorCode,
      nextAttemptAt: null,
    });
    vi.useRealTimers();
  });

  it('keeps automatic recovery processing blocked when settings are disabled', async () => {
    vi.setSystemTime(new Date('2026-09-20T12:00:00.000Z'));
    const { dispatches, provider, service } = createService({ settings: { enabled: false } });
    await service.reconcile();

    const result = await service.processDue(new Date('2026-09-20T12:00:00.000Z'), 20, {
      automatic: true,
    });

    expect(result).toEqual({
      processed: 0,
      results: [],
      skipped: 'RECOVERY_AUTOMATION_DISABLED',
    });
    expect(provider.sendText).not.toHaveBeenCalled();
    expect(dispatches.every((dispatch) => dispatch.status === 'SCHEDULED')).toBe(true);
    vi.useRealTimers();
  });

  it('allows manual recovery processing even when settings are disabled', async () => {
    vi.setSystemTime(new Date('2026-09-20T12:00:00.000Z'));
    const { provider, service } = createService({ settings: { enabled: false } });
    await service.reconcile();

    const result = await service.processDue(new Date('2026-09-20T12:00:00.000Z'));

    expect(result.processed).toBe(2);
    expect(provider.sendText).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('recalculates only future steps when offsets and send time change', async () => {
    vi.setSystemTime(new Date('2026-09-20T12:00:00.000Z'));
    const { dispatches, service, steps } = createService({ settings: { enabled: true } });
    await service.reconcile();
    Object.assign(dispatches[0]!, { status: 'SENT', sentAt: new Date() });
    Object.assign(steps[0]!, { status: 'SENT', sentAt: new Date() });

    await service.updateSettings({
      sendTime: '10:30',
      day3OffsetDays: 3,
      day10OffsetDays: 8,
      day15OffsetDays: 16,
      day30OffsetDays: 31,
    });

    expect(steps[0]!.status).toBe('SENT');
    expect(steps.slice(1).map((step) => step.delayDays)).toEqual([8, 16, 31]);
    expect((steps[1]!.scheduledFor as Date).toISOString()).toBe('2026-09-18T13:30:00.000Z');
    vi.useRealTimers();
  });
});

describe.skipIf(process.env.RUN_DATABASE_TESTS !== '1')(
  'Recovery uncertain dispatch reconciliation on PostgreSQL',
  () => {
    const prisma = new PrismaClient();
    const createdClientIds = new Set<string>();
    const createdPlanIds = new Set<string>();
    const createdConnectionIds = new Set<string>();
    const createdTemplateIds = new Set<string>();

    beforeAll(async () => {
      await prisma.$connect();
    });

    afterEach(async () => {
      const clientIds = [...createdClientIds];
      await prisma.messageDispatch.deleteMany({ where: { clientId: { in: clientIds } } });
      await prisma.recoveryCampaign.deleteMany({ where: { clientId: { in: clientIds } } });
      await prisma.clientEvent.deleteMany({ where: { clientId: { in: clientIds } } });
      await prisma.receivable.deleteMany({ where: { clientId: { in: clientIds } } });
      await prisma.clientReference.deleteMany({ where: { clientId: { in: clientIds } } });
      await prisma.client.deleteMany({ where: { id: { in: clientIds } } });
      await prisma.messageTemplate.deleteMany({ where: { id: { in: [...createdTemplateIds] } } });
      await prisma.whatsAppConnection.deleteMany({
        where: { id: { in: [...createdConnectionIds] } },
      });
      await prisma.plan.deleteMany({ where: { id: { in: [...createdPlanIds] } } });
      await prisma.recoveryAutomationSettings.deleteMany({ where: { scope: 'global' } });
      createdClientIds.clear();
      createdPlanIds.clear();
      createdConnectionIds.clear();
      createdTemplateIds.clear();
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });

    it.each([
      'PROVIDER_RESULT_UNCERTAIN',
      'PROVIDER_CONFIRMATION_MISSING',
      'PROVIDER_PERSISTENCE_UNCERTAIN',
    ])('preserves %s after schedule changes, restart and two workers', async (errorCode) => {
      const suffix = randomUUID();
      const plan = await prisma.plan.create({
        data: {
          name: `RECOVERY FIX3 ${suffix}`,
          durationMonths: 1,
          defaultValue: new Prisma.Decimal(50),
        },
      });
      createdPlanIds.add(plan.id);
      const client = await prisma.client.create({
        data: {
          name: 'Recovery FIX3 client',
          phone: '+55 (11) 99999-1234',
          phoneNormalized: '5511999991234',
          phoneE164: '+5511999991234',
          reference: `RECOVERY-FIX3-${suffix}`,
          planId: plan.id,
          recurringValue: new Prisma.Decimal(50),
          dueDate: new Date('2026-09-10T00:00:00.000Z'),
          billingAnchorDay: 10,
          billingNoticeDays: 3,
        },
      });
      createdClientIds.add(client.id);
      const reference = await prisma.clientReference.create({
        data: {
          clientId: client.id,
          reference: `RECOVERY-FIX3-REF-${suffix}`,
          planId: plan.id,
          recurringValue: new Prisma.Decimal(50),
          dueDate: new Date('2026-09-10T00:00:00.000Z'),
          billingAnchorDay: 10,
          billingNoticeDays: 3,
        },
      });
      const receivable = await prisma.receivable.create({
        data: {
          clientId: client.id,
          clientReferenceId: reference.id,
          purpose: 'RENEWAL',
          description: 'Recovery FIX3 receivable',
          amount: new Prisma.Decimal(50),
          dueDate: new Date('2026-09-10T00:00:00.000Z'),
          payerName: client.name,
          payerPhone: client.phone,
          payerPhoneNormalized: client.phoneNormalized,
        },
      });
      const connection = await prisma.whatsAppConnection.create({
        data: {
          name: `RECOVERY FIX3 connection ${suffix}`,
          providerTokenEncrypted: 'encrypted-local-token',
          status: 'CONNECTED',
          connected: true,
          loggedIn: true,
        },
      });
      createdConnectionIds.add(connection.id);
      const templateTypes = [
        'RECOVERY_DAY_3',
        'RECOVERY_DAY_7',
        'RECOVERY_DAY_15',
        'RECOVERY_DAY_30',
      ] as const;
      const templates = await Promise.all(
        templateTypes.map((type) =>
          prisma.messageTemplate.create({
            data: {
              name: `RECOVERY FIX3 ${type} ${suffix}`,
              type,
              content: 'Ola {{primeiroNome}}.',
            },
          }),
        ),
      );
      for (const template of templates) createdTemplateIds.add(template.id);
      await prisma.recoveryAutomationSettings.create({
        data: { scope: 'global', enabled: false, sendTime: '09:00' },
      });
      const campaign = await prisma.recoveryCampaign.create({
        data: {
          clientId: client.id,
          clientReferenceId: reference.id,
          receivableId: receivable.id,
          startedAt: new Date('2026-09-10T00:00:00.000Z'),
        },
      });

      let uncertainDispatchId = '';
      for (const [index, template] of templates.entries()) {
        const isUncertain = index === 0;
        const requestId = `recovery:${client.id}:${receivable.id}:${campaign.id}:${index + 1}`;
        const dispatch = await prisma.messageDispatch.create({
          data: {
            clientId: client.id,
            clientReferenceId: reference.id,
            receivableId: receivable.id,
            recoveryCampaignId: campaign.id,
            templateId: template.id,
            whatsAppConnectionId: connection.id,
            phone: client.phoneNormalized,
            body: 'Recovery FIX3 body',
            renderedContent: 'Recovery FIX3 body',
            origin: 'RECOVERY',
            status: isUncertain ? 'FAILED' : 'CANCELED',
            requestId,
            idempotencyKey: requestId,
            scheduledFor: new Date(Date.UTC(2026, 8, 13 + index * 7, 12)),
            nextAttemptAt: null,
            errorCode: isUncertain ? errorCode : 'FIXTURE_CANCELED',
            errorMessage: isUncertain ? 'Resultado remoto incerto.' : 'Fixture cancelada.',
            providerMessageId: isUncertain ? 'remote-message-preserved' : null,
          },
        });
        if (isUncertain) uncertainDispatchId = dispatch.id;
        await prisma.recoveryCampaignStep.create({
          data: {
            campaignId: campaign.id,
            stepNumber: index + 1,
            delayDays: [3, 7, 15, 30][index]!,
            templateId: template.id,
            dispatchId: dispatch.id,
            scheduledFor: dispatch.scheduledFor!,
            status: isUncertain ? 'SCHEDULED' : 'CANCELED',
          },
        });
      }

      const provider = { sendText: vi.fn() };
      const createService = () =>
        new RecoveryService(
          prisma as never,
          provider as never,
          { decrypt: vi.fn(() => 'instance-token') } as never,
          { get: vi.fn(() => undefined) } as never,
          new BillingTemplateRenderer(),
        );

      await prisma.recoveryAutomationSettings.update({
        where: { scope: 'global' },
        data: {
          sendTime: '10:30',
          day3OffsetDays: 4,
          day10OffsetDays: 11,
          day15OffsetDays: 16,
          day30OffsetDays: 31,
        },
      });
      const loadCampaign = () =>
        prisma.recoveryCampaign.findUniqueOrThrow({
          where: { id: campaign.id },
          include: {
            client: { include: { plan: true } },
            clientReference: { include: { client: true, plan: true } },
            receivable: true,
            steps: {
              include: { template: true, dispatch: true },
              orderBy: { stepNumber: 'asc' },
            },
          },
        });
      type ReconcileCampaign = {
        reconcileCampaign: (input: Awaited<ReturnType<typeof loadCampaign>>) => Promise<unknown>;
      };
      await (createService() as unknown as ReconcileCampaign).reconcileCampaign(
        await loadCampaign(),
      );
      await (createService() as unknown as ReconcileCampaign).reconcileCampaign(
        await loadCampaign(),
      );

      const preserved = await prisma.messageDispatch.findUniqueOrThrow({
        where: { id: uncertainDispatchId },
      });
      expect(preserved).toMatchObject({
        id: uncertainDispatchId,
        status: 'FAILED',
        errorCode,
        errorMessage: 'Resultado remoto incerto.',
        nextAttemptAt: null,
        providerMessageId: 'remote-message-preserved',
      });
      expect(preserved.requestId).toBe(preserved.idempotencyKey);
      expect(provider.sendText).not.toHaveBeenCalled();
      await expect(
        prisma.messageDispatch.count({
          where: { recoveryCampaignId: campaign.id, requestId: preserved.requestId },
        }),
      ).resolves.toBe(1);
    });
  },
);
