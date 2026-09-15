/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-base-to-string */
/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
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
            where.status.in.includes(status)
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
