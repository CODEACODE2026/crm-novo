import 'reflect-metadata';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { LegacyImportService } from './legacy-import.service';

const baseClient: Record<string, unknown> = {
  id: 123,
  name: 'Cliente Teste',
  phone: '44999999999',
  email: 'CLIENTE@EXEMPLO.COM',
  status: 'Ativo',
  vencimento: '2026-10-25',
  avisar: 3,
  value_mensalidade: '30.00',
  observation: 'Observacao',
  type_cobranca: 'MENSAL',
  referencia: 'cliente123',
  date_desativado: null,
  created_at: '2024-01-10 10:00:00',
  updated_at: '2026-09-20 15:00:00',
  cpf: 'ignorado',
  cobrar: 1,
  preferencia: 'PIX',
  is_processing: 0,
  user_id: 1,
  msg_enviar: 'ignorada',
};
const existingCrmClient = {
  id: 'client-legacy',
  name: 'Cliente Teste',
  phoneNormalized: '5544999999999',
  email: 'cliente@exemplo.com',
  reference: 'cliente123',
  references: [{ id: 'reference-legacy', reference: 'cliente123' }],
};
const existingCrmReference = {
  id: 'reference-legacy',
  clientId: 'client-legacy',
  reference: 'cliente123',
  client: { id: 'client-legacy', name: 'Cliente Teste' },
};
const basePayment: Record<string, unknown> = {
  id: 11670,
  client_id: 2352,
  data_criado: '2026-09-26',
  status: 'PAGO',
  valor_debito: '35.00',
  tipo_pagamento: 'PIX',
  tipo_transacao: 'RECEITA',
  data_pagamento: '2026-09-26',
  observation: null,
  created_at: '2026-09-26 10:00:00',
  updated_at: '2026-09-27 10:00:00',
};

const defaultPlanMapping = {
  ANUAL: 'plan-12',
  BIMESTRAL: 'plan-2',
  MENSAL: 'plan-1',
  SEMESTRAL: 'plan-6',
  TRIMESTRAL: 'plan-3',
};
type CreateArgs = { data: Record<string, unknown> };

function envelope(
  clients = [baseClient],
  planMapping: Partial<Record<string, string>> = defaultPlanMapping,
) {
  return {
    schemaVersion: 1,
    source: 'legacy',
    exportedAt: '2026-09-26T00:00:00Z',
    planMapping,
    clients,
  };
}

function createService(
  options: {
    clientFindFirst?: unknown;
    clients?: unknown[];
    financialCategories?: unknown[];
    financialImportRecords?: unknown[];
    financialTransactions?: unknown[];
    importRecordFindFirst?: unknown;
    importRecords?: unknown[];
    plans?: unknown[];
    receivables?: unknown[];
    receivableCycleResult?: unknown;
    receivableCycleError?: Error;
    receivableCycleHandler?: (clientReferenceId: string) => unknown;
    referenceCreateErrorFor?: string;
    referenceFindUnique?: unknown;
    references?: unknown[];
    billingSettings?: unknown;
    billingSchedulerEnabled?: string | undefined;
    messageTemplates?: unknown[];
    recoverySchedulerEnabled?: string | undefined;
    whatsAppConnection?: unknown;
  } = {},
) {
  let clientSequence = 0;
  let referenceSequence = 0;
  let financialTransactionSequence = 0;
  const writes = {
    clientCreate: vi.fn((args: CreateArgs) =>
      Promise.resolve({ id: `client-created-${++clientSequence}`, ...args.data }),
    ),
    clientEventCreate: vi.fn(),
    clientReferenceUpdate: vi.fn(),
    clientReferenceCreate: vi.fn((args: CreateArgs) => {
      if (args.data.reference === options.referenceCreateErrorFor) {
        return Promise.reject(
          Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
        );
      }

      return Promise.resolve({ id: `reference-created-${++referenceSequence}`, ...args.data });
    }),
    financialTransactionCreate: vi.fn((args: CreateArgs) =>
      Promise.resolve({
        id: `financial-transaction-${++financialTransactionSequence}`,
        ...args.data,
      }),
    ),
    legacyFinancialImportRecordCreate: vi.fn((args: CreateArgs) =>
      Promise.resolve({ id: 'legacy-financial-import-record-created', ...args.data }),
    ),
    legacyImportRecordCreate: vi.fn((args: CreateArgs) =>
      Promise.resolve({ id: 'legacy-import-record-created', ...args.data }),
    ),
    legacyImportRecordUpdate: vi.fn(),
    legacyImportRecordUpsert: vi.fn(),
    messageDispatchCreate: vi.fn(),
    messageDispatchUpdate: vi.fn(),
    paymentIntentCreate: vi.fn(),
    paymentIntentUpdate: vi.fn(),
    receivableCreate: vi.fn(),
    receivableUpdate: vi.fn(),
    receivableUpsert: vi.fn(),
    statusHistoryCreate: vi.fn(),
    clientUpdate: vi.fn(),
  };
  const defaultPlans = (options.plans ?? [
    { id: 'plan-1', name: 'Mensal', durationMonths: 1, active: true, defaultValue: '0.00' },
    {
      id: 'plan-2',
      name: 'Bimestral',
      durationMonths: 2,
      active: true,
      defaultValue: '0.00',
    },
    {
      id: 'plan-3',
      name: 'Trimestral',
      durationMonths: 3,
      active: true,
      defaultValue: '0.00',
    },
    {
      id: 'plan-6',
      name: 'Semestral',
      durationMonths: 6,
      active: true,
      defaultValue: '0.00',
    },
    {
      id: 'plan-12',
      name: 'Anual',
      durationMonths: 12,
      active: true,
      defaultValue: '0.00',
    },
  ]) as Array<{
    active: boolean;
    defaultValue?: string;
    durationMonths: number;
    id: string;
    name: string;
  }>;
  const prisma = {
    $transaction: vi.fn((input: Array<Promise<unknown>> | ((tx: unknown) => Promise<unknown>)) =>
      typeof input === 'function' ? input(prisma) : Promise.all(input),
    ),
    client: {
      create: writes.clientCreate,
      findFirst: vi.fn(() => Promise.resolve(options.clientFindFirst ?? null)),
      findMany: vi.fn(() => Promise.resolve(options.clients ?? [])),
      findUnique: vi.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(
          ((options.clients as Array<{ id: string }> | undefined) ?? []).find(
            (client) => client.id === where.id,
          ) ?? null,
        ),
      ),
      update: writes.clientUpdate,
    },
    clientReference: {
      create: writes.clientReferenceCreate,
      findUnique: vi.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(
          options.referenceFindUnique ??
            ((options.references as Array<{ id: string }> | undefined) ?? []).find(
              (reference) => reference.id === where.id,
            ) ??
            null,
        ),
      ),
      findMany: vi.fn(() => Promise.resolve(options.references ?? [])),
      update: writes.clientReferenceUpdate,
    },
    clientEvent: { create: writes.clientEventCreate },
    financialCategory: {
      findMany: vi.fn(() =>
        Promise.resolve(
          options.financialCategories ?? [
            { id: 'category-history', name: 'Receita histórica', type: 'ENTRADA', active: true },
          ],
        ),
      ),
    },
    financialTransaction: {
      create: writes.financialTransactionCreate,
      findMany: vi.fn(() => Promise.resolve(options.financialTransactions ?? [])),
      findUnique: vi.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(
          ((options.financialTransactions as Array<{ id: string }> | undefined) ?? []).find(
            (transaction) => transaction.id === where.id,
          ) ?? null,
        ),
      ),
    },
    legacyFinancialImportRecord: {
      create: writes.legacyFinancialImportRecordCreate,
      findFirst: vi.fn(({ where }: { where: { legacyPaymentId: string; source: string } }) =>
        Promise.resolve(
          (
            (options.financialImportRecords as
              Array<{ legacyPaymentId: string; source: string }> | undefined) ?? []
          ).find(
            (record) =>
              record.legacyPaymentId === where.legacyPaymentId && record.source === where.source,
          ) ?? null,
        ),
      ),
      findMany: vi.fn(() => Promise.resolve(options.financialImportRecords ?? [])),
    },
    legacyImportRecord: {
      create: writes.legacyImportRecordCreate,
      findFirst: vi.fn(({ where }: { where: { legacyClientId: string; source: string } }) =>
        Promise.resolve(
          options.importRecordFindFirst ??
            (
              (options.importRecords as
                Array<{ legacyClientId: string; source: string }> | undefined) ?? []
            ).find(
              (record) =>
                record.legacyClientId === where.legacyClientId && record.source === where.source,
            ) ??
            null,
        ),
      ),
      findMany: vi.fn(() => Promise.resolve(options.importRecords ?? [])),
      update: writes.legacyImportRecordUpdate,
      upsert: writes.legacyImportRecordUpsert,
    },
    billingAutomationSettings: {
      findUnique: vi.fn(() =>
        Promise.resolve(
          options.billingSettings ?? {
            sendTime: '09:00',
            timezone: 'America/Sao_Paulo',
          },
        ),
      ),
    },
    messageTemplate: {
      findMany: vi.fn(() =>
        Promise.resolve(
          options.messageTemplates ?? [
            { id: 'billing-template', type: 'BILLING_DUE', active: true },
          ],
        ),
      ),
    },
    messageDispatch: { create: writes.messageDispatchCreate, update: writes.messageDispatchUpdate },
    paymentIntent: { create: writes.paymentIntentCreate, update: writes.paymentIntentUpdate },
    plan: {
      findMany: vi.fn(() => Promise.resolve(defaultPlans)),
      findUnique: vi.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(defaultPlans.find((plan) => plan.id === where.id) ?? null),
      ),
    },
    receivable: {
      create: writes.receivableCreate,
      findMany: vi.fn(() => Promise.resolve(options.receivables ?? [])),
      update: writes.receivableUpdate,
      upsert: writes.receivableUpsert,
    },
    statusHistory: { create: writes.statusHistoryCreate },
    whatsAppConnection: {
      findFirst: vi.fn(() =>
        Promise.resolve(
          'whatsAppConnection' in options
            ? options.whatsAppConnection
            : {
                id: 'whatsapp-connection',
                status: 'CONNECTED',
                connected: true,
                loggedIn: true,
              },
        ),
      ),
    },
  };

  const config = {
    get: vi.fn((key: string) => {
      if (key === 'BILLING_SCHEDULER_ENABLED') {
        return Object.prototype.hasOwnProperty.call(options, 'billingSchedulerEnabled')
          ? options.billingSchedulerEnabled
          : 'false';
      }

      if (key === 'RECOVERY_SCHEDULER_ENABLED') {
        return Object.prototype.hasOwnProperty.call(options, 'recoverySchedulerEnabled')
          ? options.recoverySchedulerEnabled
          : 'false';
      }

      return undefined;
    }),
  };
  const receivableCycleService = {
    ensureCurrentCycleReceivable: vi.fn((clientReferenceId: string) => {
      if (options.receivableCycleHandler) {
        return Promise.resolve(options.receivableCycleHandler(clientReferenceId));
      }

      if (options.receivableCycleError) {
        return Promise.reject(options.receivableCycleError);
      }

      return Promise.resolve(
        options.receivableCycleResult ?? {
          action: 'created',
          receivable: { id: `receivable-${clientReferenceId}` },
        },
      );
    }),
  };

  return {
    config,
    prisma,
    receivableCycleService,
    service: new LegacyImportService(
      prisma as never,
      config as never,
      receivableCycleService as never,
    ),
    writes,
  };
}

function expectNoOperationalSideEffects(writes: ReturnType<typeof createService>['writes']) {
  expect(writes.receivableCreate).not.toHaveBeenCalled();
  expect(writes.messageDispatchCreate).not.toHaveBeenCalled();
  expect(writes.paymentIntentCreate).not.toHaveBeenCalled();
  expect(writes.financialTransactionCreate).not.toHaveBeenCalled();
  expect(writes.clientEventCreate).not.toHaveBeenCalled();
  expect(writes.statusHistoryCreate).not.toHaveBeenCalled();
}

function expectNoCutoverWrites(writes: ReturnType<typeof createService>['writes']) {
  expect(writes.clientCreate).not.toHaveBeenCalled();
  expect(writes.clientUpdate).not.toHaveBeenCalled();
  expect(writes.clientReferenceCreate).not.toHaveBeenCalled();
  expect(writes.clientReferenceUpdate).not.toHaveBeenCalled();
  expect(writes.receivableCreate).not.toHaveBeenCalled();
  expect(writes.receivableUpdate).not.toHaveBeenCalled();
  expect(writes.receivableUpsert).not.toHaveBeenCalled();
  expect(writes.messageDispatchCreate).not.toHaveBeenCalled();
  expect(writes.messageDispatchUpdate).not.toHaveBeenCalled();
  expect(writes.paymentIntentCreate).not.toHaveBeenCalled();
  expect(writes.financialTransactionCreate).not.toHaveBeenCalled();
  expect(writes.legacyImportRecordCreate).not.toHaveBeenCalled();
  expect(writes.legacyImportRecordUpdate).not.toHaveBeenCalled();
}

function cutoverImportRecord(overrides: Record<string, unknown> = {}) {
  return {
    legacyClientId: '2352',
    source: 'legacy',
    status: 'IMPORTED',
    crmClientId: 'client-edilson',
    crmClientReferenceId: 'reference-edilson',
    payloadHash: 'a'.repeat(64),
    ...overrides,
  };
}

function cutoverClient(overrides: Record<string, unknown> = {}) {
  return {
    id: 'client-edilson',
    name: 'edilson',
    phoneNormalized: '5581997927581',
    status: 'ATIVO',
    ...overrides,
  };
}

function cutoverReference(overrides: Record<string, unknown> = {}) {
  return {
    id: 'reference-edilson',
    clientId: 'client-edilson',
    reference: 'edilson7581',
    planId: 'plan-1',
    recurringValue: new Prisma.Decimal('35.00'),
    dueDate: new Date('2026-10-26T00:00:00.000Z'),
    billingAnchorDay: 26,
    billingNoticeDays: 0,
    status: 'ATIVO',
    ...overrides,
  };
}

function cutoverReceivable(overrides: Record<string, unknown> = {}) {
  return {
    id: 'receivable-edilson',
    clientReferenceId: 'reference-edilson',
    purpose: 'RENEWAL',
    amount: new Prisma.Decimal('35.00'),
    dueDate: new Date('2026-10-26T00:00:00.000Z'),
    status: 'PENDENTE',
    ...overrides,
  };
}

function createCutoverService(
  options: Parameters<typeof createService>[0] = {},
): ReturnType<typeof createService> {
  return createService({
    clients: [cutoverClient()],
    importRecords: [cutoverImportRecord()],
    references: [cutoverReference()],
    ...options,
  });
}

describe('LegacyImportService', () => {
  it('rejects unsupported envelope metadata', async () => {
    const { service } = createService();

    await expect(
      service.previewClients({ ...envelope(), schemaVersion: 2 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.previewClients({ ...envelope(), source: 'other' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('normalizes a valid row as READY_CREATE without persisting preview data', async () => {
    const { service, writes } = createService();

    const result = await service.previewClients(envelope());

    expect(result.summary).toMatchObject({ readyCreate: 1, total: 1 });
    expect(result.rows[0]).toMatchObject({
      billingAnchorDay: 25,
      billingNoticeDays: 3,
      classification: 'READY_CREATE',
      email: 'cliente@exemplo.com',
      errors: [],
      legacyClientId: '123',
      normalizedStatus: 'ATIVO',
      phoneNormalized: '5544999999999',
      plan: { durationMonths: 1, id: 'plan-1', name: 'Mensal' },
      recurringValue: '30.00',
    });
    expect(result.rows[0]?.payloadHash).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.values(writes).every((fn) => fn.mock.calls.length === 0)).toBe(true);
  });

  it('imports READY_CREATE rows as Client, ClientReference and LegacyImportRecord only', async () => {
    const { service, writes } = createService({
      plans: [
        {
          active: true,
          defaultValue: '30.00',
          durationMonths: 1,
          id: 'plan-1',
          name: 'Mensal',
        },
      ],
    });

    const result = await service.importClients(
      envelope(
        [
          {
            ...baseClient,
            avisar: 0,
            email: null,
            id: 2352,
            name: 'edilson',
            phone: '5581997927581',
            referencia: 'edilson7581',
            type_cobranca: 'MENSAL',
            value_mensalidade: '35.00',
            vencimento: '2026-10-26',
          },
        ],
        { MENSAL: 'plan-1' },
      ),
    );

    expect(result.summary).toEqual({ failed: 0, imported: 1, requested: 1, skipped: 0 });
    expect(result.rows[0]).toMatchObject({
      code: 'IMPORTED',
      crmClientId: 'client-created-1',
      crmClientReferenceId: 'reference-created-1',
      legacyClientId: '2352',
      result: 'IMPORTED',
    });
    expect(writes.clientCreate.mock.calls[0]?.[0].data).toMatchObject({
      billingAnchorDay: 26,
      billingNoticeDays: 0,
      email: null,
      name: 'edilson',
      notes: 'Observacao',
      phone: '5581997927581',
      phoneNormalized: '5581997927581',
      planId: 'plan-1',
      recurringValue: '35.00',
      reference: 'edilson7581',
      status: 'ATIVO',
    });
    expect(writes.clientReferenceCreate.mock.calls[0]?.[0].data).toMatchObject({
      billingAnchorDay: 26,
      billingNoticeDays: 0,
      clientId: 'client-created-1',
      notes: 'Observacao',
      planId: 'plan-1',
      recurringValue: '35.00',
      reference: 'edilson7581',
      status: 'ATIVO',
    });
    expect(writes.legacyImportRecordCreate.mock.calls[0]?.[0].data).toMatchObject({
      crmClientId: 'client-created-1',
      crmClientReferenceId: 'reference-created-1',
      errorCode: null,
      legacyClientId: '2352',
      source: 'legacy',
      status: 'IMPORTED',
    });
    expect(writes.clientCreate.mock.calls[0]?.[0].data.dueDate).toEqual(new Date('2026-10-26'));
    expect(writes.clientReferenceCreate.mock.calls[0]?.[0].data.dueDate).toEqual(
      new Date('2026-10-26'),
    );
    expect(writes.legacyImportRecordCreate.mock.calls[0]?.[0].data.payloadHash).toMatch(
      /^[a-f0-9]{64}$/,
    );
    expectNoOperationalSideEffects(writes);
  });

  it('imports only active legacy status as ATIVO', async () => {
    const { service, writes } = createService();

    const result = await service.importClients(
      envelope([{ ...baseClient, id: 10, status: 'Ativo', referencia: 'status-ativo' }]),
    );

    expect(result.summary).toEqual({ failed: 0, imported: 1, requested: 1, skipped: 0 });
    expect(writes.clientCreate.mock.calls[0]?.[0].data).toMatchObject({ status: 'ATIVO' });
    expect(writes.clientReferenceCreate.mock.calls[0]?.[0].data).toMatchObject({
      status: 'ATIVO',
    });
    expectNoOperationalSideEffects(writes);
  });

  it.each(['Novo', 'Pendente', 'Inativo', 'Cancelado'])(
    'classifies legacy status %s as SKIPPED_NOT_ACTIVE',
    async (legacyStatus) => {
      const { service } = createService();

      const result = await service.previewClients(
        envelope([
          { ...baseClient, id: 10, status: legacyStatus, referencia: `status-${legacyStatus}` },
        ]),
      );

      expect(result.summary).toMatchObject({ notActive: 1, readyCreate: 0, total: 1 });
      expect(result.rows[0]).toMatchObject({
        classification: 'SKIPPED_NOT_ACTIVE',
        normalizedStatus:
          legacyStatus === 'Inativo'
            ? 'INATIVO'
            : legacyStatus === 'Cancelado'
              ? 'CANCELADO'
              : null,
        status: legacyStatus,
      });
    },
  );

  it('skips non READY_CREATE rows and does not create operational side effects', async () => {
    const { service, writes } = createService({
      clients: [existingCrmClient],
      references: [existingCrmReference],
    });

    const result = await service.importClients(
      envelope([
        { ...baseClient, id: 1, referencia: 'possible-match' },
        { ...baseClient, id: 2, status: 'Novo', referencia: 'not-active' },
        { ...baseClient, id: 3, phone: '123', referencia: 'invalid' },
      ]),
    );

    expect(result.summary).toEqual({ failed: 0, imported: 0, requested: 3, skipped: 3 });
    expect(result.rows.map((row) => row.code)).toEqual([
      'POSSIBLE_MATCH',
      'SKIPPED_NOT_ACTIVE',
      'INVALID',
    ]);
    expect(writes.clientCreate).not.toHaveBeenCalled();
    expect(writes.clientReferenceCreate).not.toHaveBeenCalled();
    expect(writes.legacyImportRecordCreate).not.toHaveBeenCalled();
    expectNoOperationalSideEffects(writes);
  });

  it('does not import non-active, possible match, conflict, invalid or ready update rows', async () => {
    const { service, writes } = createService({
      clients: [existingCrmClient],
      references: [existingCrmReference],
      importRecords: [
        {
          legacyClientId: '6',
          payloadHash: '0'.repeat(64),
          source: 'legacy',
          crmClientId: 'client-legacy',
          crmClientReferenceId: 'reference-legacy',
        },
      ],
    });

    const result = await service.importClients(
      envelope([
        { ...baseClient, id: 1, status: 'Novo', referencia: 'novo' },
        { ...baseClient, id: 2, status: 'Pendente', referencia: 'pendente' },
        { ...baseClient, id: 3, phone: existingCrmClient.phoneNormalized, referencia: 'match' },
        { ...baseClient, id: 4, referencia: 'dup' },
        { ...baseClient, id: 5, referencia: 'dup' },
        { ...baseClient, id: 6, referencia: 'cliente123' },
        { ...baseClient, id: 8, phone: '123', referencia: 'invalid' },
      ]),
    );

    expect(result.summary).toEqual({ failed: 0, imported: 0, requested: 7, skipped: 7 });
    expect(result.rows.map((row) => row.code)).toEqual([
      'SKIPPED_NOT_ACTIVE',
      'SKIPPED_NOT_ACTIVE',
      'POSSIBLE_MATCH',
      'CONFLICT',
      'CONFLICT',
      'READY_UPDATE',
      'INVALID',
    ]);
    expect(writes.clientCreate).not.toHaveBeenCalled();
    expect(writes.clientReferenceCreate).not.toHaveBeenCalled();
    expect(writes.legacyImportRecordCreate).not.toHaveBeenCalled();
    expectNoOperationalSideEffects(writes);
  });

  it('ignores frontend classification fields and recalculates eligibility on the backend', async () => {
    const { service, writes } = createService();

    const result = await service.importClients(
      envelope([
        {
          ...baseClient,
          classification: 'READY_CREATE',
          id: 70,
          phone: '123',
          referencia: 'forged-ready-create',
        },
      ]),
    );

    expect(result.summary).toEqual({ failed: 0, imported: 0, requested: 1, skipped: 1 });
    expect(result.rows[0]).toMatchObject({ code: 'INVALID', result: 'SKIPPED' });
    expect(writes.clientCreate).not.toHaveBeenCalled();
    expect(writes.clientReferenceCreate).not.toHaveBeenCalled();
    expect(writes.legacyImportRecordCreate).not.toHaveBeenCalled();
    expectNoOperationalSideEffects(writes);
  });

  it('does not import a non-active row even when frontend fields are forged as ready', async () => {
    const { service, writes } = createService();

    const result = await service.importClients(
      envelope([
        {
          ...baseClient,
          classification: 'READY_CREATE',
          id: 71,
          referencia: 'forged-not-active',
          status: 'Inativo',
        },
      ]),
    );

    expect(result.summary).toEqual({ failed: 0, imported: 0, requested: 1, skipped: 1 });
    expect(result.rows[0]).toMatchObject({ code: 'SKIPPED_NOT_ACTIVE', result: 'SKIPPED' });
    expect(writes.clientCreate).not.toHaveBeenCalled();
    expect(writes.clientReferenceCreate).not.toHaveBeenCalled();
    expect(writes.legacyImportRecordCreate).not.toHaveBeenCalled();
    expectNoOperationalSideEffects(writes);
  });

  it('keeps client and reference operational fields consistent for imported rows', async () => {
    const { service, writes } = createService();

    await service.importClients(envelope());

    const clientData = writes.clientCreate.mock.calls[0]?.[0].data;
    const referenceData = writes.clientReferenceCreate.mock.calls[0]?.[0].data;

    expect(clientData).toMatchObject({
      billingAnchorDay: referenceData?.billingAnchorDay,
      billingNoticeDays: referenceData?.billingNoticeDays,
      dueDate: referenceData?.dueDate,
      planId: referenceData?.planId,
      recurringValue: referenceData?.recurringValue,
      reference: referenceData?.reference,
      status: referenceData?.status,
    });
  });

  it('does not create clients, references or lifecycle metadata for inactive or canceled rows', async () => {
    const { service, writes } = createService();

    const result = await service.importClients(
      envelope([
        { ...baseClient, id: 80, referencia: 'inactive-row', status: 'Inativo' },
        { ...baseClient, id: 81, referencia: 'canceled-row', status: 'Cancelado' },
      ]),
    );

    expect(result.rows.map((row) => row.code)).toEqual([
      'SKIPPED_NOT_ACTIVE',
      'SKIPPED_NOT_ACTIVE',
    ]);
    expect(writes.clientCreate).not.toHaveBeenCalled();
    expect(writes.clientReferenceCreate).not.toHaveBeenCalled();
    expect(writes.legacyImportRecordCreate).not.toHaveBeenCalled();
    expectNoOperationalSideEffects(writes);
  });

  it('counts mixed active-only batches without importing non-active rows', async () => {
    const { service } = createService();
    const clients = [
      ...Array.from({ length: 10 }, (_, index) => ({
        ...baseClient,
        id: 100 + index,
        referencia: `active-${index}`,
        status: 'Ativo',
      })),
      ...Array.from({ length: 2 }, (_, index) => ({
        ...baseClient,
        id: 200 + index,
        referencia: `novo-${index}`,
        status: 'Novo',
      })),
      ...Array.from({ length: 3 }, (_, index) => ({
        ...baseClient,
        id: 300 + index,
        referencia: `pendente-${index}`,
        status: 'Pendente',
      })),
      ...Array.from({ length: 4 }, (_, index) => ({
        ...baseClient,
        id: 400 + index,
        referencia: `inativo-${index}`,
        status: 'Inativo',
      })),
      { ...baseClient, id: 500, referencia: 'cancelado-0', status: 'Cancelado' },
    ];

    const result = await service.previewClients(envelope(clients));

    expect(result.summary).toMatchObject({ notActive: 10, readyCreate: 10, total: 20 });
  });

  it('does not let non-active duplicate references block active importable rows', async () => {
    const { service } = createService();

    const result = await service.previewClients(
      envelope([
        { ...baseClient, id: 1, referencia: 'shared-reference', status: 'Ativo' },
        { ...baseClient, id: 2, referencia: 'shared-reference', status: 'Inativo' },
      ]),
    );

    expect(result.rows[0]).toMatchObject({ classification: 'READY_CREATE', errors: [] });
    expect(result.rows[1]).toMatchObject({ classification: 'SKIPPED_NOT_ACTIVE' });
    expect(result.rows[1]?.errors).not.toContain('DUPLICATE_REFERENCE_IN_FILE');
  });

  it('keeps duplicate legacy ids structural even when one row is non-active', async () => {
    const { service } = createService();

    const result = await service.previewClients(
      envelope([
        { ...baseClient, id: 1, referencia: 'active-duplicate-id', status: 'Ativo' },
        { ...baseClient, id: 1, referencia: 'inactive-duplicate-id', status: 'Inativo' },
      ]),
    );

    expect(result.rows[0]).toMatchObject({ classification: 'CONFLICT' });
    expect(result.rows[1]).toMatchObject({ classification: 'CONFLICT' });
    expect(result.rows[0]?.errors).toContain('DUPLICATE_LEGACY_ID_IN_FILE');
    expect(result.rows[1]?.errors).toContain('DUPLICATE_LEGACY_ID_IN_FILE');
  });

  it('reports an existing legacy mapping that is now non-active without changing CRM data', async () => {
    const { service, writes } = createService({
      clients: [existingCrmClient],
      importRecords: [
        {
          crmClientId: 'client-legacy',
          crmClientReferenceId: 'reference-legacy',
          legacyClientId: '123',
          payloadHash: '0'.repeat(64),
          source: 'legacy',
        },
      ],
      references: [existingCrmReference],
    });

    const result = await service.previewClients(
      envelope([{ ...baseClient, id: 123, referencia: 'cliente123', status: 'Inativo' }]),
    );

    expect(result.rows[0]).toMatchObject({ classification: 'CONFLICT' });
    expect(result.rows[0]?.errors).toContain('NOT_ACTIVE_EXISTING_MAPPING');
    expect(writes.clientUpdate).not.toHaveBeenCalled();
    expect(writes.clientReferenceUpdate).not.toHaveBeenCalled();
    expect(writes.legacyImportRecordUpdate).not.toHaveBeenCalled();
  });

  it('keeps financial and cutover flows blind to non-active clients skipped by IMPORT1', async () => {
    const { service, writes } = createService();

    const importResult = await service.importClients(
      envelope([{ ...baseClient, id: 2352, referencia: 'edilson7581', status: 'Pendente' }]),
    );
    const paymentPreview = await service.previewPayments({
      exportedAt: '2026-09-26T00:00:00Z',
      payments: [basePayment],
      schemaVersion: 1,
      source: 'legacy',
    });
    const cutoverPreview = await service.previewCutover();

    expect(importResult.rows[0]).toMatchObject({
      code: 'SKIPPED_NOT_ACTIVE',
      result: 'SKIPPED',
    });
    expect(paymentPreview.rows[0]).toMatchObject({ classification: 'CLIENT_NOT_IMPORTED' });
    expect(cutoverPreview.summary).toMatchObject({ ready: 0, total: 0 });
    expect(writes.clientCreate).not.toHaveBeenCalled();
    expect(writes.clientReferenceCreate).not.toHaveBeenCalled();
    expect(writes.legacyImportRecordCreate).not.toHaveBeenCalled();
    expect(writes.financialTransactionCreate).not.toHaveBeenCalled();
  });

  it('keeps import idempotent when legacy mapping already exists', async () => {
    const first = createService();
    const firstPreview = await first.service.previewClients(envelope());
    const payloadHash = firstPreview.rows[0]?.payloadHash;
    const { service, writes } = createService({
      clients: [existingCrmClient],
      references: [existingCrmReference],
      importRecords: [
        {
          legacyClientId: '123',
          payloadHash,
          source: 'legacy',
          crmClientId: 'client-legacy',
          crmClientReferenceId: 'reference-legacy',
        },
      ],
    });

    const result = await service.importClients(envelope());

    expect(result.summary).toEqual({ failed: 0, imported: 0, requested: 1, skipped: 1 });
    expect(result.rows[0]).toMatchObject({
      code: 'UNCHANGED',
      result: 'SKIPPED',
    });
    expect(writes.clientCreate).not.toHaveBeenCalled();
  });

  it('skips hash-changed existing imports without updating or duplicating records', async () => {
    const { service, writes } = createService({
      clients: [existingCrmClient],
      references: [existingCrmReference],
      importRecords: [
        {
          legacyClientId: '123',
          payloadHash: '0'.repeat(64),
          source: 'legacy',
          crmClientId: 'client-legacy',
          crmClientReferenceId: 'reference-legacy',
        },
      ],
    });

    const result = await service.importClients(
      envelope([{ ...baseClient, value_mensalidade: '40.00' }]),
    );

    expect(result.summary).toEqual({ failed: 0, imported: 0, requested: 1, skipped: 1 });
    expect(result.rows[0]).toMatchObject({ code: 'READY_UPDATE', result: 'SKIPPED' });
    expect(writes.clientCreate).not.toHaveBeenCalled();
    expect(writes.clientReferenceCreate).not.toHaveBeenCalled();
    expect(writes.clientUpdate).not.toHaveBeenCalled();
    expect(writes.clientReferenceUpdate).not.toHaveBeenCalled();
    expect(writes.legacyImportRecordCreate).not.toHaveBeenCalled();
    expect(writes.legacyImportRecordUpdate).not.toHaveBeenCalled();
  });

  it('returns UNCHANGED on repreview after a successful import', async () => {
    const first = createService();
    const firstPreview = await first.service.previewClients(envelope());
    const payloadHash = firstPreview.rows[0]?.payloadHash;
    const { service } = createService({
      clients: [existingCrmClient],
      references: [existingCrmReference],
      importRecords: [
        {
          legacyClientId: '123',
          payloadHash,
          source: 'legacy',
          crmClientId: 'client-legacy',
          crmClientReferenceId: 'reference-legacy',
        },
      ],
    });

    const repreview = await service.previewClients(envelope());

    expect(repreview.summary).toMatchObject({ unchanged: 1 });
    expect(repreview.rows[0]).toMatchObject({
      classification: 'UNCHANGED',
      legacyClientId: '123',
    });
  });

  it('rolls back row transaction when reference unique race happens', async () => {
    const { prisma, service, writes } = createService();
    prisma.clientReference.create.mockRejectedValueOnce(
      Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
    );

    const result = await service.importClients(envelope());

    expect(result.summary).toEqual({ failed: 1, imported: 0, requested: 1, skipped: 0 });
    expect(result.rows[0]).toMatchObject({ code: 'CONFLICT', result: 'FAILED' });
    expect(writes.legacyImportRecordCreate).not.toHaveBeenCalled();
    expectNoOperationalSideEffects(writes);
  });

  it('maps a legacy id unique race to a failed row without creating financial side effects', async () => {
    const { prisma, service, writes } = createService();
    prisma.legacyImportRecord.create.mockRejectedValueOnce(
      Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
    );

    const result = await service.importClients(envelope());

    expect(result.summary).toEqual({ failed: 1, imported: 0, requested: 1, skipped: 0 });
    expect(result.rows[0]).toMatchObject({ code: 'CONFLICT', result: 'FAILED' });
    expect(writes.clientCreate).toHaveBeenCalledTimes(1);
    expect(writes.clientReferenceCreate).toHaveBeenCalledTimes(1);
    expectNoOperationalSideEffects(writes);
  });

  it('revalidates current matches inside the row transaction before writing', async () => {
    const { service, writes } = createService({
      referenceFindUnique: { id: 'reference-created-between-preview-and-import' },
    });

    const result = await service.importClients(envelope());

    expect(result.summary).toEqual({ failed: 0, imported: 0, requested: 1, skipped: 1 });
    expect(result.rows[0]).toMatchObject({ code: 'REFERENCE_MATCH', result: 'SKIPPED' });
    expect(writes.clientCreate).not.toHaveBeenCalled();
    expect(writes.clientReferenceCreate).not.toHaveBeenCalled();
    expect(writes.legacyImportRecordCreate).not.toHaveBeenCalled();
    expectNoOperationalSideEffects(writes);
  });

  it('continues the batch when the middle READY_CREATE row fails safely', async () => {
    const { service, writes } = createService({ referenceCreateErrorFor: 'race-reference' });

    const result = await service.importClients(
      envelope([
        { ...baseClient, id: 1, email: 'primeiro@exemplo.com', referencia: 'first-reference' },
        { ...baseClient, id: 2, email: 'segundo@exemplo.com', referencia: 'race-reference' },
        { ...baseClient, id: 3, email: 'terceiro@exemplo.com', referencia: 'third-reference' },
      ]),
    );

    expect(result.summary).toEqual({ failed: 1, imported: 2, requested: 3, skipped: 0 });
    expect(result.rows.map((row) => row.result)).toEqual(['IMPORTED', 'FAILED', 'IMPORTED']);
    expect(writes.clientCreate).toHaveBeenCalledTimes(3);
    expect(writes.clientReferenceCreate).toHaveBeenCalledTimes(3);
    expect(writes.legacyImportRecordCreate).toHaveBeenCalledTimes(2);
    expectNoOperationalSideEffects(writes);
  });

  it('keeps legacy ids as canonical strings, including bigint unsigned boundaries', async () => {
    const { service } = createService();

    const result = await service.previewClients(
      envelope([
        { ...baseClient, id: 1, referencia: 'min' },
        { ...baseClient, id: '18446744073709551615', referencia: 'bigint-max' },
        { ...baseClient, id: '18446744073709551616', referencia: 'bigint-over' },
        { ...baseClient, id: 0, referencia: 'zero' },
        { ...baseClient, id: -1, referencia: 'negative' },
        { ...baseClient, id: 'abc', referencia: 'not-numeric' },
      ]),
    );

    expect(result.rows[0]).toMatchObject({
      classification: 'READY_CREATE',
      legacyClientId: '1',
    });
    expect(result.rows[1]).toMatchObject({
      classification: 'READY_CREATE',
      legacyClientId: '18446744073709551615',
    });
    for (const row of result.rows.slice(2)) {
      expect(row).toMatchObject({
        classification: 'INVALID',
        legacyClientId: null,
      });
      expect(row.errors).toContain('INVALID_LEGACY_ID');
    }
  });

  it('rejects unsafe JS numbers without trying to recover lost precision', async () => {
    const { service } = createService();

    const result = await service.previewClients(
      envelope([{ ...baseClient, id: Number.MAX_SAFE_INTEGER + 1, referencia: 'unsafe-number' }]),
    );

    expect(result.rows[0]).toMatchObject({
      classification: 'INVALID',
      legacyClientId: null,
    });
    expect(result.rows[0]?.errors).toContain('INVALID_LEGACY_ID');
  });

  it('normalizes leading zero legacy ids before duplicate detection', async () => {
    const { service } = createService();

    const result = await service.previewClients(
      envelope([
        { ...baseClient, id: 123, referencia: 'numeric' },
        { ...baseClient, id: '000123', referencia: 'string-leading-zero' },
      ]),
    );

    expect(result.rows.map((row) => row.legacyClientId)).toEqual(['123', '123']);
    expect(result.rows[0]?.classification).toBe('CONFLICT');
    expect(result.rows[1]?.classification).toBe('CONFLICT');
    expect(result.rows[0]?.errors).toContain('DUPLICATE_LEGACY_ID_IN_FILE');
    expect(result.rows[1]?.errors).toContain('DUPLICATE_LEGACY_ID_IN_FILE');
  });

  it('keeps payload hash deterministic and ignores non-importable legacy fields', async () => {
    const { service } = createService();

    const first = await service.previewClients(envelope());
    const second = await service.previewClients(
      envelope([
        {
          msg_enviar: 'mudou',
          user_id: 999,
          is_processing: 1,
          preferencia: 'BOLETO',
          cobrar: 0,
          cpf: 'outro',
          updated_at: '2030-01-01 00:00:00',
          referencia: 'cliente123',
          type_cobranca: 'MENSAL',
          observation: 'Observacao',
          value_mensalidade: '30.00',
          avisar: 3,
          vencimento: '2026-10-25',
          status: 'Ativo',
          email: 'CLIENTE@EXEMPLO.COM',
          phone: '44999999999',
          name: 'Cliente Teste',
          id: 123,
        },
      ]),
    );

    expect(second.ignoredFields).toEqual([
      'cpf',
      'cobrar',
      'preferencia',
      'is_processing',
      'user_id',
      'msg_enviar',
    ]);
    expect(second.rows[0]?.payloadHash).toBe(first.rows[0]?.payloadHash);
  });

  it('flags unsafe numbers, duplicate ids, duplicate references, ambiguous statuses and invalid fields', async () => {
    const { service } = createService();

    const result = await service.previewClients(
      envelope([
        {
          ...baseClient,
          id: Number.MAX_SAFE_INTEGER + 1,
          name: '',
          phone: '123',
          email: 'email-invalido',
          status: 'Novo',
          vencimento: null,
          avisar: -1,
          value_mensalidade: '0.00',
          referencia: 'dup',
        },
        { ...baseClient, id: '123', status: 'Pendente', referencia: 'dup' },
        { ...baseClient, id: '123', referencia: 'outra' },
      ]),
    );

    expect(result.rows[0]?.classification).toBe('INVALID');
    expect(result.rows[0]?.errors).toEqual(
      expect.arrayContaining([
        'INVALID_LEGACY_ID',
        'INVALID_NAME',
        'INVALID_PHONE',
        'INVALID_EMAIL',
        'INVALID_DUE_DATE',
        'INVALID_BILLING_NOTICE_DAYS',
        'INVALID_RECURRING_VALUE',
      ]),
    );
    expect(result.rows[1]?.classification).toBe('CONFLICT');
    expect(result.rows[1]?.errors).toEqual(expect.arrayContaining(['DUPLICATE_LEGACY_ID_IN_FILE']));
  });

  it('keeps non-active precedence over import-only validation errors', async () => {
    const { service } = createService();

    const result = await service.previewClients(
      envelope(
        [
          { ...baseClient, id: 1, status: 'Pendente', phone: '123', referencia: 'pendente-phone' },
          {
            ...baseClient,
            id: 2,
            status: 'Inativo',
            referencia: 'inactive-plan',
            type_cobranca: 'MENSAL',
          },
        ],
        {},
      ),
    );

    expect(result.rows[0]?.classification).toBe('SKIPPED_NOT_ACTIVE');
    expect(result.rows[0]?.errors).toContain('INVALID_PHONE');
    expect(result.rows[1]?.classification).toBe('SKIPPED_NOT_ACTIVE');
    expect(result.rows[1]?.errors).not.toContain('PLAN_NOT_MAPPED');
  });

  it.each([
    ['Desconhecido', 'INVALID_STATUS'],
    ['', 'INVALID_STATUS'],
  ])('classifies legacy status %s as INVALID', async (legacyStatus, code) => {
    const { service } = createService();

    const result = await service.previewClients(
      envelope([{ ...baseClient, id: 1, status: legacyStatus, referencia: 'bad-status' }]),
    );

    expect(result.rows[0]?.classification).toBe('INVALID');
    expect(result.rows[0]?.errors).toContain(code);
  });

  it('maps all legacy billing cycles through explicit active plans', async () => {
    const { service } = createService({
      plans: [
        { id: 'plan-1', name: 'Mensal', durationMonths: 1, active: true },
        { id: 'plan-2', name: 'Bimestral', durationMonths: 2, active: true },
        { id: 'plan-3', name: 'Trimestral', durationMonths: 3, active: true },
        { id: 'plan-6', name: 'Semestral', durationMonths: 6, active: true },
        { id: 'plan-12', name: 'Anual', durationMonths: 12, active: true },
      ],
    });

    const result = await service.previewClients(
      envelope([
        { ...baseClient, id: 1, referencia: 'mensal', type_cobranca: 'MENSAL' },
        { ...baseClient, id: 2, referencia: 'bimestral', type_cobranca: 'BIMESTRAL' },
        { ...baseClient, id: 3, referencia: 'trimestral', type_cobranca: 'TRIMESTRAL' },
        { ...baseClient, id: 4, referencia: 'semestral', type_cobranca: 'SEMESTRAL' },
        { ...baseClient, id: 5, referencia: 'anual', type_cobranca: 'ANUAL' },
      ]),
    );

    expect(result.rows[0]?.plan).toMatchObject({ durationMonths: 1, id: 'plan-1' });
    expect(result.rows[1]?.plan).toMatchObject({ durationMonths: 2, id: 'plan-2' });
    expect(result.rows[2]?.plan).toMatchObject({ durationMonths: 3, id: 'plan-3' });
    expect(result.rows[3]?.plan).toMatchObject({ durationMonths: 6, id: 'plan-6' });
    expect(result.rows[4]?.plan).toMatchObject({ durationMonths: 12, id: 'plan-12' });
  });

  it('blocks missing and invalid explicit plan mappings without falling back to duration matching', async () => {
    const { service } = createService({
      plans: [
        { id: 'plan-1', name: 'Mensal', durationMonths: 1, active: true },
        { id: 'plan-3', name: 'Trimestral', durationMonths: 3, active: true },
        { id: 'inactive-plan', name: 'Mensal Inativo', durationMonths: 1, active: false },
      ],
    });

    const result = await service.previewClients(
      envelope(
        [
          { ...baseClient, id: 1, referencia: 'missing', type_cobranca: 'MENSAL' },
          { ...baseClient, id: 2, referencia: 'wrong-duration', type_cobranca: 'MENSAL' },
          { ...baseClient, id: 3, referencia: 'inactive', type_cobranca: 'MENSAL' },
          { ...baseClient, id: 4, referencia: 'not-found', type_cobranca: 'MENSAL' },
        ],
        {
          BIMESTRAL: 'plan-2',
          TRIMESTRAL: 'plan-3',
          SEMESTRAL: 'plan-6',
          ANUAL: 'plan-12',
        },
      ),
    );

    expect(result.rows[0]).toMatchObject({
      classification: 'CONFLICT',
      errors: ['PLAN_NOT_MAPPED'],
    });

    const wrongDuration = await service.previewClients(
      envelope([{ ...baseClient, id: 5, referencia: 'wrong-duration' }], {
        ...defaultPlanMapping,
        MENSAL: 'plan-3',
      }),
    );
    expect(wrongDuration.rows[0]).toMatchObject({
      classification: 'CONFLICT',
      errors: ['INVALID_PLAN_MAPPING'],
    });

    const inactive = await service.previewClients(
      envelope([{ ...baseClient, id: 6, referencia: 'inactive' }], {
        ...defaultPlanMapping,
        MENSAL: 'inactive-plan',
      }),
    );
    expect(inactive.rows[0]).toMatchObject({
      classification: 'CONFLICT',
      errors: ['INVALID_PLAN_MAPPING'],
    });

    const notFound = await service.previewClients(
      envelope([{ ...baseClient, id: 7, referencia: 'not-found' }], {
        ...defaultPlanMapping,
        MENSAL: 'missing-plan',
      }),
    );
    expect(notFound.rows[0]).toMatchObject({
      classification: 'CONFLICT',
      errors: ['INVALID_PLAN_MAPPING'],
    });
  });

  it('uses explicit mapping even when multiple active plans share the same duration', async () => {
    const { service } = createService({
      plans: [
        { id: 'plan-1', name: 'Mensal', durationMonths: 1, active: true },
        { id: 'plan-alt', name: 'Mensal Premium', durationMonths: 1, active: true },
      ],
    });

    const result = await service.previewClients(envelope());

    expect(result.rows[0]).toMatchObject({
      classification: 'READY_CREATE',
      plan: { durationMonths: 1, id: 'plan-1', name: 'Mensal' },
    });
    expect(result.rows[0]?.errors).not.toContain('PLAN_AMBIGUOUS');
  });

  it('changes the payload hash when explicit mapping points to a different valid plan', async () => {
    const { service } = createService({
      plans: [
        { id: 'plan-1', name: 'Mensal', durationMonths: 1, active: true },
        { id: 'plan-alt', name: 'Mensal Premium', durationMonths: 1, active: true },
      ],
    });

    const first = await service.previewClients(envelope());
    const second = await service.previewClients(
      envelope([{ ...baseClient, referencia: 'cliente123' }], {
        ...defaultPlanMapping,
        MENSAL: 'plan-alt',
      }),
    );

    expect(first.rows[0]?.payloadHash).toMatch(/^[a-f0-9]{64}$/);
    expect(second.rows[0]?.payloadHash).toMatch(/^[a-f0-9]{64}$/);
    expect(second.rows[0]?.plan).toMatchObject({ id: 'plan-alt' });
    expect(second.rows[0]?.payloadHash).not.toBe(first.rows[0]?.payloadHash);
  });

  it('keeps mapping scoped per row in multi-cycle files', async () => {
    const { service } = createService();

    const result = await service.previewClients(
      envelope([
        { ...baseClient, id: 1, referencia: 'mensal', type_cobranca: 'MENSAL' },
        { ...baseClient, id: 2, referencia: 'bimestral', type_cobranca: 'BIMESTRAL' },
        { ...baseClient, id: 3, referencia: 'trimestral', type_cobranca: 'TRIMESTRAL' },
        { ...baseClient, id: 4, referencia: 'semestral', type_cobranca: 'SEMESTRAL' },
        { ...baseClient, id: 5, referencia: 'anual', type_cobranca: 'ANUAL' },
      ]),
    );

    expect(result.rows.map((row) => row.plan?.id)).toEqual([
      'plan-1',
      'plan-2',
      'plan-3',
      'plan-6',
      'plan-12',
    ]);
    expect(result.summary).toMatchObject({ conflict: 0, readyCreate: 5 });
  });

  it('applies one cycle mapping to every client in a 100-row batch without per-client plan choice', async () => {
    const { service } = createService();
    const distribution = [
      ['MENSAL', 70, 'plan-1'],
      ['BIMESTRAL', 10, 'plan-2'],
      ['TRIMESTRAL', 10, 'plan-3'],
      ['SEMESTRAL', 5, 'plan-6'],
      ['ANUAL', 5, 'plan-12'],
    ] as const;
    const clients = distribution.flatMap(([cycle, count], groupIndex) =>
      Array.from({ length: count }, (_, index) => {
        const absoluteIndex =
          distribution
            .slice(0, groupIndex)
            .reduce((total, [, previousCount]) => total + previousCount, 0) + index;

        return {
          ...baseClient,
          id: absoluteIndex + 1,
          email: `cliente-${absoluteIndex}@exemplo.com`,
          phone: `4499${String(absoluteIndex).padStart(7, '0')}`,
          referencia: `cliente-${absoluteIndex}`,
          type_cobranca: cycle,
        };
      }),
    );

    const result = await service.previewClients(envelope(clients));

    expect(result.summary).toMatchObject({ readyCreate: 100, total: 100 });
    for (const [cycle, count, planId] of distribution) {
      const rows = result.rows.filter((row) => clients[row.index]?.type_cobranca === cycle);

      expect(rows).toHaveLength(count);
      expect(rows.every((row) => row.plan?.id === planId)).toBe(true);
    }
  });

  it('keeps client recurring value from the legacy file instead of Plan defaultValue', async () => {
    const { service } = createService({
      plans: [
        {
          active: true,
          defaultValue: '30.00',
          durationMonths: 1,
          id: 'plan-1',
          name: 'Mensal',
        },
      ],
    });

    const result = await service.previewClients(
      envelope(
        [
          {
            ...baseClient,
            id: 2352,
            name: 'Edilson',
            referencia: 'edilson7581',
            type_cobranca: 'MENSAL',
            value_mensalidade: '35.00',
            vencimento: '2026-10-26',
          },
        ],
        { MENSAL: 'plan-1' },
      ),
    );

    expect(result.rows[0]).toMatchObject({
      classification: 'READY_CREATE',
      dueDate: '2026-10-26',
      legacyClientId: '2352',
      plan: { id: 'plan-1', name: 'Mensal' },
      recurringValue: '35.00',
      reference: 'edilson7581',
    });
  });

  it('allows partial mappings and blocks only rows whose cycle is not mapped', async () => {
    const { service } = createService();

    const result = await service.previewClients(
      envelope(
        [
          { ...baseClient, id: 1, referencia: 'mensal', type_cobranca: 'MENSAL' },
          { ...baseClient, id: 2, referencia: 'anual', type_cobranca: 'ANUAL' },
        ],
        { MENSAL: 'plan-1' },
      ),
    );

    expect(result.rows[0]).toMatchObject({
      classification: 'READY_CREATE',
      plan: { id: 'plan-1' },
    });
    expect(result.rows[1]).toMatchObject({
      classification: 'CONFLICT',
      errors: ['PLAN_NOT_MAPPED'],
    });
  });

  it('ignores unused known-cycle mappings without changing a used row', async () => {
    const { service } = createService();

    const result = await service.previewClients(
      envelope([{ ...baseClient, id: 1, referencia: 'mensal', type_cobranca: 'MENSAL' }], {
        MENSAL: 'plan-1',
        BIMESTRAL: 'missing-unused-plan',
        TRIMESTRAL: 'missing-unused-plan',
        SEMESTRAL: 'missing-unused-plan',
        ANUAL: 'missing-unused-plan',
      }),
    );

    expect(result.rows[0]).toMatchObject({
      classification: 'READY_CREATE',
      errors: [],
      plan: { id: 'plan-1' },
    });
  });

  it('rejects unknown plan mapping keys at the envelope boundary', async () => {
    const { service } = createService();

    await expect(
      service.previewClients({
        ...envelope(),
        planMapping: { ...defaultPlanMapping, MENSAL_PREMIUM: 'plan-1' },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects reusing the same plan for a cycle with a different expected duration', async () => {
    const { service } = createService();

    const result = await service.previewClients(
      envelope(
        [
          { ...baseClient, id: 1, referencia: 'mensal', type_cobranca: 'MENSAL' },
          { ...baseClient, id: 2, referencia: 'bimestral', type_cobranca: 'BIMESTRAL' },
        ],
        {
          MENSAL: 'plan-1',
          BIMESTRAL: 'plan-1',
        },
      ),
    );

    expect(result.rows[0]).toMatchObject({
      classification: 'READY_CREATE',
      plan: { id: 'plan-1' },
    });
    expect(result.rows[1]).toMatchObject({
      classification: 'CONFLICT',
      errors: ['INVALID_PLAN_MAPPING'],
    });
  });

  it('returns candidate matches and does not auto-merge by reference, phone, email or name', async () => {
    const { service } = createService({
      clients: [
        {
          id: 'client-phone',
          name: 'Cliente Teste',
          phoneNormalized: '5544999999999',
          email: 'cliente@exemplo.com',
          reference: 'manual',
          references: [{ id: 'ref-phone', reference: 'manual' }],
        },
      ],
      references: [
        {
          id: 'ref-existing',
          clientId: 'client-existing',
          reference: 'cliente123',
          client: { id: 'client-existing', name: 'Existente' },
        },
      ],
    });

    const result = await service.previewClients(envelope());

    expect(result.rows[0]?.classification).toBe('POSSIBLE_MATCH');
    expect(result.rows[0]?.candidateMatches.map((match) => match.field)).toEqual(
      expect.arrayContaining(['reference', 'phone', 'email', 'name']),
    );
    expect(result.rows[0]?.warnings).toEqual(
      expect.arrayContaining(['REFERENCE_MATCH', 'PHONE_MATCH', 'EMAIL_MATCH']),
    );
  });

  it('does not auto-match by name alone', async () => {
    const { service } = createService({
      clients: [
        {
          id: 'client-name',
          name: 'Cliente Teste',
          phoneNormalized: '5544888888888',
          email: 'outro@exemplo.com',
          reference: 'manual',
          references: [{ id: 'ref-name', reference: 'manual' }],
        },
      ],
    });

    const result = await service.previewClients(envelope());

    expect(result.rows[0]?.candidateMatches).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'name' })]),
    );
    expect(result.rows[0]?.classification).toBe('POSSIBLE_MATCH');
  });

  it('uses normalized payload hash for UNCHANGED and READY_UPDATE', async () => {
    const first = createService();
    const firstPreview = await first.service.previewClients(envelope());
    const payloadHash = firstPreview.rows[0]?.payloadHash;
    const unchanged = createService({
      clients: [existingCrmClient],
      references: [existingCrmReference],
      importRecords: [
        {
          legacyClientId: '123',
          payloadHash,
          source: 'legacy',
          crmClientId: 'client-legacy',
          crmClientReferenceId: 'reference-legacy',
        },
      ],
    });
    const updated = createService({
      clients: [existingCrmClient],
      references: [existingCrmReference],
      importRecords: [
        {
          legacyClientId: '123',
          payloadHash: '0'.repeat(64),
          source: 'legacy',
          crmClientId: 'client-legacy',
          crmClientReferenceId: 'reference-legacy',
        },
      ],
    });

    await expect(unchanged.service.previewClients(envelope())).resolves.toMatchObject({
      summary: { unchanged: 1 },
    });
    await expect(updated.service.previewClients(envelope())).resolves.toMatchObject({
      summary: { readyUpdate: 1 },
    });
  });

  it('classifies incomplete or orphan legacy mappings as CONFLICT before hash states', async () => {
    const first = createService();
    const firstPreview = await first.service.previewClients(envelope());
    const payloadHash = firstPreview.rows[0]?.payloadHash;
    const cases = [
      {
        name: 'missing client id',
        importRecord: {
          legacyClientId: '123',
          payloadHash,
          source: 'legacy',
          crmClientId: null,
          crmClientReferenceId: 'reference-legacy',
        },
        error: 'INCOMPLETE_LEGACY_MAPPING',
      },
      {
        name: 'missing reference id',
        importRecord: {
          legacyClientId: '123',
          payloadHash: '0'.repeat(64),
          source: 'legacy',
          crmClientId: 'client-legacy',
          crmClientReferenceId: null,
        },
        error: 'INCOMPLETE_LEGACY_MAPPING',
      },
      {
        name: 'client absent',
        importRecord: {
          legacyClientId: '123',
          payloadHash,
          source: 'legacy',
          crmClientId: 'missing-client',
          crmClientReferenceId: 'reference-legacy',
        },
        clients: [],
        references: [existingCrmReference],
        error: 'ORPHAN_LEGACY_MAPPING',
      },
      {
        name: 'reference absent',
        importRecord: {
          legacyClientId: '123',
          payloadHash: '0'.repeat(64),
          source: 'legacy',
          crmClientId: 'client-legacy',
          crmClientReferenceId: 'missing-reference',
        },
        clients: [existingCrmClient],
        references: [],
        error: 'ORPHAN_LEGACY_MAPPING',
      },
      {
        name: 'reference belongs to another client',
        importRecord: {
          legacyClientId: '123',
          payloadHash,
          source: 'legacy',
          crmClientId: 'client-legacy',
          crmClientReferenceId: 'reference-legacy',
        },
        clients: [existingCrmClient],
        references: [{ ...existingCrmReference, clientId: 'other-client' }],
        error: 'ORPHAN_LEGACY_MAPPING',
      },
    ];

    for (const item of cases) {
      const { service } = createService({
        clients: item.clients ?? [existingCrmClient],
        references: item.references ?? [existingCrmReference],
        importRecords: [item.importRecord],
      });

      const result = await service.previewClients(envelope());

      expect(result.rows[0]?.classification, item.name).toBe('CONFLICT');
      expect(result.rows[0]?.classification, item.name).not.toBe('UNCHANGED');
      expect(result.rows[0]?.classification, item.name).not.toBe('READY_UPDATE');
      expect(result.rows[0]?.errors, item.name).toContain(item.error);
      expect(result.rows[0]?.warnings, item.name).toContain(
        'Existe um vínculo de importação anterior, mas o cliente ou referência associado não está mais disponível ou está inconsistente.',
      );
    }
  });

  it('uses bounded batch lookups instead of per-row N+1 queries', async () => {
    const rows = Array.from({ length: 1_000 }, (_, index) => ({
      ...baseClient,
      id: index + 1,
      phone: `449${String(index).padStart(8, '0')}`,
      email: `cliente${index}@exemplo.com`,
      referencia: `cliente-${index}`,
    }));
    const { prisma, service } = createService();

    await service.previewClients(envelope(rows));

    expect(prisma.plan.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.legacyImportRecord.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.clientReference.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.client.findMany).toHaveBeenCalledTimes(1);
  });

  it('validates existing legacy mappings in batch without per-row lookups', async () => {
    const rows = Array.from({ length: 100 }, (_, index) => ({
      ...baseClient,
      id: index + 1,
      email: `cliente${index}@exemplo.com`,
      referencia: `cliente-${index}`,
    }));
    const importRecords = rows.map((row, index) => ({
      legacyClientId: String(row.id),
      payloadHash: '0'.repeat(64),
      source: 'legacy',
      crmClientId: `client-${index}`,
      crmClientReferenceId: `reference-${index}`,
    }));
    const clients = importRecords.map((record, index) => ({
      id: record.crmClientId,
      name: `Cliente ${index}`,
      phoneNormalized: `5544999${String(index).padStart(6, '0')}`,
      email: `crm${index}@exemplo.com`,
      reference: `crm-${index}`,
      references: [{ id: record.crmClientReferenceId, reference: `crm-${index}` }],
    }));
    const references = importRecords.map((record, index) => ({
      id: record.crmClientReferenceId,
      clientId: record.crmClientId,
      reference: `crm-${index}`,
      client: { id: record.crmClientId, name: `Cliente ${index}` },
    }));
    const { prisma, service } = createService({ clients, importRecords, references });

    await service.previewClients(envelope(rows));

    expect(prisma.legacyImportRecord.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.client.findMany).toHaveBeenCalledTimes(2);
    expect(prisma.clientReference.findMany).toHaveBeenCalledTimes(2);
  });

  it('rejects empty and oversized client lists while accepting an empty import file preview', async () => {
    const { service } = createService();

    await expect(service.previewClients(envelope([]))).resolves.toMatchObject({
      summary: { total: 0 },
      rows: [],
    });
    await expect(
      service.previewClients(envelope(Array.from({ length: 10_001 }, () => baseClient))),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('normalizes phone variants, preserves date-only anchor day and validates decimal values', async () => {
    const { service } = createService();

    const result = await service.previewClients(
      envelope([
        { ...baseClient, id: 1, phone: '44999999999', referencia: 'phone-1' },
        { ...baseClient, id: 2, phone: '(44) 99999-9999', referencia: 'phone-2' },
        { ...baseClient, id: 3, phone: '+55 44 99999-9999', referencia: 'phone-3' },
        { ...baseClient, id: 4, phone: '5544999999999', referencia: 'phone-4' },
        { ...baseClient, id: 5, phone: '123', referencia: 'phone-invalid' },
        { ...baseClient, id: 6, value_mensalidade: '30,00', referencia: 'value-comma' },
        { ...baseClient, id: 7, value_mensalidade: -1, referencia: 'value-negative' },
        { ...baseClient, id: 8, value_mensalidade: null, referencia: 'value-null' },
      ]),
    );

    expect(result.rows.slice(0, 4).map((row) => row.phoneNormalized)).toEqual([
      '5544999999999',
      '5544999999999',
      '5544999999999',
      '5544999999999',
    ]);
    expect(result.rows[0]).toMatchObject({ billingAnchorDay: 25, dueDate: '2026-10-25' });
    expect(result.rows[4]?.errors).toContain('INVALID_PHONE');
    expect(result.rows[5]).toMatchObject({
      classification: 'READY_CREATE',
      recurringValue: '30.00',
    });
    expect(result.rows[6]?.errors).toContain('INVALID_RECURRING_VALUE');
    expect(result.rows[7]?.errors).toContain('INVALID_RECURRING_VALUE');
  });

  it('previews Edilson payment 11670 as READY_PAID_HISTORY without writes when mapping exists', async () => {
    const { service, writes } = createService({
      clients: [{ id: 'client-edilson', name: 'Edilson' }],
      importRecords: [
        {
          crmClientId: 'client-edilson',
          crmClientReferenceId: 'reference-edilson',
          legacyClientId: '2352',
          payloadHash: 'client-hash',
          source: 'legacy',
          status: 'IMPORTED',
        },
      ],
      references: [
        { id: 'reference-edilson', clientId: 'client-edilson', reference: 'edilson7581' },
      ],
    });

    const result = await service.previewPayments({
      schemaVersion: 1,
      source: 'legacy',
      payments: [basePayment],
    });

    expect(result.summary).toMatchObject({ readyPaidHistory: 1, total: 1 });
    expect(result.rows[0]).toMatchObject({
      amount: '35.00',
      category: { name: 'Receita histórica', type: 'ENTRADA' },
      classification: 'READY_PAID_HISTORY',
      clientName: 'Edilson',
      crmClientId: 'client-edilson',
      crmClientReferenceId: 'reference-edilson',
      legacyClientId: '2352',
      legacyPaymentId: '11670',
      paymentMethod: 'PIX',
      receivableId: null,
      reference: 'edilson7581',
      transactionDate: '2026-09-26',
    });
    expect(result.rows[0]?.payloadHash).toMatch(/^[a-f0-9]{64}$/);
    expectNoOperationalSideEffects(writes);
    expect(writes.legacyFinancialImportRecordCreate).not.toHaveBeenCalled();
    expect(writes.legacyImportRecordCreate).not.toHaveBeenCalled();
  });

  it('classifies Edilson payment 11670 as CLIENT_NOT_IMPORTED when DEV has no client mapping', async () => {
    const { service, writes } = createService();

    const result = await service.previewPayments({
      schemaVersion: 1,
      source: 'legacy',
      payments: [basePayment],
    });

    expect(result.summary).toMatchObject({ clientNotImported: 1, total: 1 });
    expect(result.rows[0]).toMatchObject({
      classification: 'CLIENT_NOT_IMPORTED',
      legacyClientId: '2352',
      legacyPaymentId: '11670',
    });
    expectNoOperationalSideEffects(writes);
  });

  it('normalizes unsigned bigint payment ids and flags duplicates without writes', async () => {
    const { service, writes } = createService();

    const result = await service.previewPayments({
      schemaVersion: 1,
      source: 'legacy',
      payments: [
        { ...basePayment, id: 1, client_id: 1 },
        { ...basePayment, id: '18446744073709551615', client_id: 2 },
        { ...basePayment, id: '18446744073709551616', client_id: 3 },
        { ...basePayment, id: 0, client_id: 4 },
        { ...basePayment, id: -1, client_id: 5 },
        { ...basePayment, id: '00011670', client_id: 6 },
        { ...basePayment, id: 11670, client_id: 7 },
      ],
    });

    expect(result.rows.map((row) => row.legacyPaymentId)).toEqual([
      '1',
      '18446744073709551615',
      null,
      null,
      null,
      '11670',
      '11670',
    ]);
    expect(result.rows[2]?.classification).toBe('INVALID');
    expect(result.rows[2]?.errors).toContain('INVALID_LEGACY_PAYMENT_ID');
    expect(result.rows[3]?.errors).toContain('INVALID_LEGACY_PAYMENT_ID');
    expect(result.rows[4]?.errors).toContain('INVALID_LEGACY_PAYMENT_ID');
    expect(result.rows[5]?.classification).toBe('CONFLICT');
    expect(result.rows[6]?.classification).toBe('CONFLICT');
    expect(result.rows[5]?.errors).toContain('DUPLICATE_LEGACY_PAYMENT_ID_IN_FILE');
    expect(result.rows[6]?.errors).toContain('DUPLICATE_LEGACY_PAYMENT_ID_IN_FILE');
    expectNoOperationalSideEffects(writes);
  });

  it('rejects unsafe JS payment ids and enforces the 10000 payments preview limit', async () => {
    const { service } = createService();

    await expect(
      service.previewPayments({
        schemaVersion: 1,
        source: 'legacy',
        payments: Array.from({ length: 10_000 }, (_, index) => ({
          ...basePayment,
          id: index + 1,
          client_id: index + 1,
        })),
      }),
    ).resolves.toMatchObject({ summary: { total: 10_000 } });
    await expect(
      service.previewPayments({
        schemaVersion: 1,
        source: 'legacy',
        payments: Array.from({ length: 10_001 }, (_, index) => ({
          ...basePayment,
          id: index + 1,
          client_id: index + 1,
        })),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const unsafe = await service.previewPayments({
      schemaVersion: 1,
      source: 'legacy',
      payments: [{ ...basePayment, id: Number.MAX_SAFE_INTEGER + 1 }],
    });

    expect(unsafe.rows[0]).toMatchObject({ classification: 'INVALID', legacyPaymentId: null });
    expect(unsafe.rows[0]?.errors).toContain('INVALID_LEGACY_PAYMENT_ID');
  });

  it('previews 9337 mapped payments with batched lookups and a consistent summary', async () => {
    const payments = Array.from({ length: 9_337 }, (_, index) => ({
      ...basePayment,
      id: index + 1,
      client_id: index + 1,
    }));
    const importRecords = payments.map((payment, index) => ({
      crmClientId: `client-${index + 1}`,
      crmClientReferenceId: `reference-${index + 1}`,
      legacyClientId: String(payment.client_id),
      payloadHash: 'client-hash',
      source: 'legacy',
      status: 'IMPORTED',
    }));
    const clients = importRecords.map((record, index) => ({
      id: record.crmClientId,
      name: `Cliente ${index + 1}`,
    }));
    const references = importRecords.map((record, index) => ({
      clientId: record.crmClientId,
      id: record.crmClientReferenceId,
      reference: `cliente-${index + 1}`,
    }));
    const { prisma, service, writes } = createService({ clients, importRecords, references });

    const result = await service.previewPayments({
      schemaVersion: 1,
      source: 'legacy',
      payments,
    });

    expect(result.summary).toEqual({
      clientNotImported: 0,
      conflict: 0,
      invalid: 0,
      pending: 0,
      readyPaidHistory: 9_337,
      total: 9_337,
      unchanged: 0,
      unsupported: 0,
    });
    expect(
      Object.entries(result.summary)
        .filter(([key]) => key !== 'total')
        .reduce((sum, [, value]) => sum + value, 0),
    ).toBe(result.summary.total);
    expect(prisma.financialCategory.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.legacyImportRecord.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.legacyFinancialImportRecord.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.client.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.clientReference.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.financialTransaction.findMany).toHaveBeenCalledTimes(1);
    expectNoOperationalSideEffects(writes);
    expect(writes.legacyFinancialImportRecordCreate).not.toHaveBeenCalled();
  });

  it('keeps payment hash deterministic and ignores updated_at and property order', async () => {
    const options = {
      clients: [{ id: 'client-edilson', name: 'Edilson' }],
      importRecords: [
        {
          crmClientId: 'client-edilson',
          crmClientReferenceId: 'reference-edilson',
          legacyClientId: '2352',
          payloadHash: 'client-hash',
          source: 'legacy',
          status: 'IMPORTED',
        },
      ],
      references: [
        { id: 'reference-edilson', clientId: 'client-edilson', reference: 'edilson7581' },
      ],
    };
    const { service } = createService(options);
    const first = await service.previewPayments({
      schemaVersion: 1,
      source: 'legacy',
      payments: [basePayment],
    });
    const reordered = await service.previewPayments({
      schemaVersion: 1,
      source: 'legacy',
      payments: [
        {
          updated_at: '2030-01-01',
          observation: null,
          data_pagamento: '2026-09-26',
          tipo_transacao: 'RECEITA',
          tipo_pagamento: 'PIX',
          valor_debito: '35,00',
          status: 'PAGO',
          data_criado: '2026-09-26',
          client_id: '0002352',
          id: '00011670',
        },
      ],
    });
    const amountChanged = await service.previewPayments({
      schemaVersion: 1,
      source: 'legacy',
      payments: [{ ...basePayment, valor_debito: '36.00' }],
    });
    const methodChanged = await service.previewPayments({
      schemaVersion: 1,
      source: 'legacy',
      payments: [{ ...basePayment, tipo_pagamento: 'BOLETO' }],
    });
    const dateChanged = await service.previewPayments({
      schemaVersion: 1,
      source: 'legacy',
      payments: [{ ...basePayment, data_pagamento: '2026-09-27' }],
    });

    expect(reordered.rows[0]?.payloadHash).toBe(first.rows[0]?.payloadHash);
    expect(amountChanged.rows[0]?.payloadHash).not.toBe(first.rows[0]?.payloadHash);
    expect(methodChanged.rows[0]?.payloadHash).not.toBe(first.rows[0]?.payloadHash);
    expect(dateChanged.rows[0]?.payloadHash).not.toBe(first.rows[0]?.payloadHash);
  });

  it('normalizes payment values and rejects invalid values and dates without date fallback', async () => {
    const { service } = createService({
      clients: [{ id: 'client-edilson', name: 'Edilson' }],
      importRecords: [
        {
          crmClientId: 'client-edilson',
          crmClientReferenceId: 'reference-edilson',
          legacyClientId: '2352',
          payloadHash: 'client-hash',
          source: 'legacy',
          status: 'IMPORTED',
        },
      ],
      references: [
        { id: 'reference-edilson', clientId: 'client-edilson', reference: 'edilson7581' },
      ],
    });

    const result = await service.previewPayments({
      schemaVersion: 1,
      source: 'legacy',
      payments: [
        { ...basePayment, id: 1, valor_debito: 35 },
        { ...basePayment, id: 2, valor_debito: 35.0 },
        { ...basePayment, id: 3, valor_debito: '35.00' },
        { ...basePayment, id: 4, valor_debito: '35,00' },
        { ...basePayment, id: 5, valor_debito: 0 },
        { ...basePayment, id: 6, valor_debito: -1 },
        { ...basePayment, id: 7, valor_debito: 'abc' },
        { ...basePayment, id: 8, data_pagamento: null },
        { ...basePayment, id: 9, data_pagamento: '2026-02-30' },
        { ...basePayment, id: 10, data_pagamento: '2026-13-01' },
        { ...basePayment, id: 11, data_pagamento: 'texto' },
      ],
    });

    expect(result.rows.slice(0, 4).map((row) => row.amount)).toEqual([
      '35.00',
      '35.00',
      '35.00',
      '35.00',
    ]);
    expect(result.rows[0]).toMatchObject({ transactionDate: '2026-09-26' });
    for (const row of result.rows.slice(4, 7)) {
      expect(row.classification).toBe('INVALID');
      expect(row.errors).toContain('INVALID_AMOUNT');
    }
    for (const row of result.rows.slice(7)) {
      expect(row.classification).toBe('INVALID');
      expect(row.errors).toContain('INVALID_PAYMENT_DATE');
    }
  });

  it('classifies pending, expense, invalid value, orphan client mapping and existing financial mapping', async () => {
    const mappedOptions = {
      clients: [{ id: 'client-edilson', name: 'Edilson' }],
      importRecords: [
        {
          crmClientId: 'client-edilson',
          crmClientReferenceId: 'reference-edilson',
          legacyClientId: '2352',
          payloadHash: 'client-hash',
          source: 'legacy',
          status: 'IMPORTED',
        },
      ],
      references: [
        { id: 'reference-edilson', clientId: 'client-edilson', reference: 'edilson7581' },
      ],
    };
    const first = createService(mappedOptions);
    const preview = await first.service.previewPayments({
      schemaVersion: 1,
      source: 'legacy',
      payments: [basePayment],
    });
    const payloadHash = preview.rows[0]?.payloadHash;
    const unchanged = createService({
      ...mappedOptions,
      financialImportRecords: [
        {
          crmClientId: 'client-edilson',
          crmClientReferenceId: 'reference-edilson',
          financialTransactionId: 'transaction-1',
          legacyClientId: '2352',
          legacyPaymentId: '11670',
          payloadHash,
          receivableId: null,
          status: 'IMPORTED',
        },
      ],
      financialTransactions: [
        {
          clientId: 'client-edilson',
          clientReferenceId: 'reference-edilson',
          id: 'transaction-1',
        },
      ],
    });

    await expect(
      unchanged.service.previewPayments({
        schemaVersion: 1,
        source: 'legacy',
        payments: [basePayment],
      }),
    ).resolves.toMatchObject({ summary: { unchanged: 1 } });

    const conflict = createService({
      ...mappedOptions,
      financialImportRecords: [
        {
          crmClientId: 'client-edilson',
          crmClientReferenceId: 'reference-edilson',
          financialTransactionId: 'transaction-1',
          legacyClientId: '2352',
          legacyPaymentId: '11670',
          payloadHash: '0'.repeat(64),
          receivableId: null,
          status: 'IMPORTED',
        },
      ],
      financialTransactions: [
        {
          clientId: 'client-edilson',
          clientReferenceId: 'reference-edilson',
          id: 'transaction-1',
        },
      ],
    });
    const mixed = await conflict.service.previewPayments({
      schemaVersion: 1,
      source: 'legacy',
      payments: [
        { ...basePayment, id: 1, status: 'PENDENTE' },
        { ...basePayment, id: 2, tipo_transacao: 'DESPESA' },
        { ...basePayment, id: 3, valor_debito: '0' },
        basePayment,
      ],
    });

    expect(mixed.rows.map((row) => row.classification)).toEqual([
      'PENDING_NOT_SUPPORTED',
      'UNSUPPORTED',
      'INVALID',
      'CONFLICT',
    ]);

    const orphan = await createService({
      importRecords: [
        {
          crmClientId: 'client-missing',
          crmClientReferenceId: 'reference-missing',
          legacyClientId: '2352',
          payloadHash: 'client-hash',
          source: 'legacy',
          status: 'IMPORTED',
        },
      ],
    }).service.previewPayments({
      schemaVersion: 1,
      source: 'legacy',
      payments: [basePayment],
    });

    expect(orphan.rows[0]).toMatchObject({ classification: 'CONFLICT' });
    expect(orphan.rows[0]?.errors).toContain('ORPHAN_LEGACY_CLIENT_MAPPING');
  });

  it('uses safe financial preview classification precedence', async () => {
    const { service } = createService({
      clients: [{ id: 'client-edilson', name: 'Edilson' }],
      importRecords: [
        {
          crmClientId: 'client-edilson',
          crmClientReferenceId: 'reference-edilson',
          legacyClientId: '2352',
          payloadHash: 'client-hash',
          source: 'legacy',
          status: 'IMPORTED',
        },
        {
          crmClientId: 'client-edilson',
          crmClientReferenceId: 'reference-edilson',
          legacyClientId: '2353',
          payloadHash: 'client-hash',
          source: 'legacy',
          status: 'FAILED',
        },
      ],
      references: [
        { id: 'reference-edilson', clientId: 'client-edilson', reference: 'edilson7581' },
      ],
    });

    const result = await service.previewPayments({
      schemaVersion: 1,
      source: 'legacy',
      payments: [
        { ...basePayment, id: 'bad', status: 'PENDENTE' },
        { ...basePayment, id: 2, client_id: 2353 },
        { ...basePayment, id: 3, client_id: 9999, status: 'PENDENTE' },
        { ...basePayment, id: 4, status: 'PENDENTE' },
        { ...basePayment, id: 5, tipo_transacao: 'DESPESA' },
        { ...basePayment, id: 6, status: 'BAIXADO' },
      ],
    });

    expect(result.rows.map((row) => row.classification)).toEqual([
      'INVALID',
      'CONFLICT',
      'CLIENT_NOT_IMPORTED',
      'PENDING_NOT_SUPPORTED',
      'UNSUPPORTED',
      'UNSUPPORTED',
    ]);
    expect(result.rows[1]?.errors).toContain('ORPHAN_LEGACY_CLIENT_MAPPING');
  });

  it('keeps historical BOLETO, CARTAO and TRANSFERENCIA ready without provider side effects', async () => {
    const { service, writes } = createService({
      clients: [{ id: 'client-edilson', name: 'Edilson' }],
      importRecords: [
        {
          crmClientId: 'client-edilson',
          crmClientReferenceId: 'reference-edilson',
          legacyClientId: '2352',
          payloadHash: 'client-hash',
          source: 'legacy',
          status: 'IMPORTED',
        },
      ],
      references: [
        { id: 'reference-edilson', clientId: 'client-edilson', reference: 'edilson7581' },
      ],
    });

    const result = await service.previewPayments({
      schemaVersion: 1,
      source: 'legacy',
      payments: [
        { ...basePayment, id: 1, tipo_pagamento: 'PIX' },
        { ...basePayment, id: 2, tipo_pagamento: 'BOLETO' },
        { ...basePayment, id: 3, tipo_pagamento: 'CARTAO' },
        { ...basePayment, id: 4, tipo_pagamento: 'TRANSFERENCIA' },
        { ...basePayment, id: 5, tipo_pagamento: 'DINHEIRO' },
      ],
    });

    expect(result.rows.slice(0, 4).map((row) => row.classification)).toEqual([
      'READY_PAID_HISTORY',
      'READY_PAID_HISTORY',
      'READY_PAID_HISTORY',
      'READY_PAID_HISTORY',
    ]);
    expect(result.rows[4]).toMatchObject({ classification: 'INVALID' });
    expect(result.rows[4]?.errors).toContain('INVALID_PAYMENT_METHOD');
    expectNoOperationalSideEffects(writes);
  });

  it('reports category conflicts without creating the historical category during preview', async () => {
    const missing = await createService({ financialCategories: [] }).service.previewPayments({
      schemaVersion: 1,
      source: 'legacy',
      payments: [basePayment],
    });
    const inactive = await createService({
      financialCategories: [
        { id: 'category-history', name: 'Receita histórica', type: 'ENTRADA', active: false },
      ],
    }).service.previewPayments({
      schemaVersion: 1,
      source: 'legacy',
      payments: [basePayment],
    });

    expect(missing.rows[0]).toMatchObject({ classification: 'CONFLICT' });
    expect(missing.rows[0]?.errors).toContain('CATEGORY_NOT_FOUND');
    expect(inactive.rows[0]).toMatchObject({ classification: 'CONFLICT' });
    expect(inactive.rows[0]?.errors).toContain('CATEGORY_INACTIVE');
  });

  it('imports only READY_PAID_HISTORY payments with one atomic transaction per payment', async () => {
    const { prisma, service, writes } = createService({
      clients: [{ id: 'client-edilson', name: 'Edilson' }],
      importRecords: [
        {
          crmClientId: 'client-edilson',
          crmClientReferenceId: 'reference-edilson',
          legacyClientId: '2352',
          payloadHash: 'client-hash',
          source: 'legacy',
          status: 'IMPORTED',
        },
      ],
      references: [
        { id: 'reference-edilson', clientId: 'client-edilson', reference: 'edilson7581' },
      ],
    });

    const result = await service.importPayments({
      schemaVersion: 1,
      source: 'legacy',
      payments: [basePayment, { ...basePayment, id: 11671, client_id: 9999 }],
    });

    expect(result.summary).toEqual({ failed: 0, imported: 1, requested: 2, skipped: 1 });
    expect(result.rows).toMatchObject([
      {
        code: 'IMPORTED',
        financialTransactionId: 'financial-transaction-1',
        legacyClientId: '2352',
        legacyPaymentId: '11670',
        result: 'IMPORTED',
      },
      {
        code: 'CLIENT_NOT_IMPORTED',
        legacyClientId: '9999',
        legacyPaymentId: '11671',
        result: 'SKIPPED',
      },
    ]);
    expect(
      prisma.$transaction.mock.calls.filter(([input]) => typeof input === 'function'),
    ).toHaveLength(1);
    expect(writes.financialTransactionCreate).toHaveBeenCalledTimes(1);
    expect(writes.financialTransactionCreate).toHaveBeenCalledWith({
      data: {
        amount: new Prisma.Decimal('35.00'),
        categoryId: 'category-history',
        clientId: 'client-edilson',
        clientReferenceId: 'reference-edilson',
        description: 'Receita histórica importada',
        notes: null,
        origin: 'LEGACY_IMPORT',
        paymentMethod: 'PIX',
        receivableId: null,
        transactionDate: new Date('2026-09-26T00:00:00.000Z'),
        type: 'ENTRADA',
      },
    });
    expect(writes.legacyFinancialImportRecordCreate.mock.calls[0]?.[0].data).toMatchObject({
      crmClientId: 'client-edilson',
      crmClientReferenceId: 'reference-edilson',
      errorCode: null,
      financialTransactionId: 'financial-transaction-1',
      legacyClientId: '2352',
      legacyPaymentId: '11670',
      receivableId: null,
      source: 'legacy',
      status: 'IMPORTED',
    });
    expect(writes.legacyFinancialImportRecordCreate.mock.calls[0]?.[0].data.payloadHash).toMatch(
      /^[a-f0-9]{64}$/,
    );
    expect(writes.receivableCreate).not.toHaveBeenCalled();
    expect(writes.paymentIntentCreate).not.toHaveBeenCalled();
    expect(writes.messageDispatchCreate).not.toHaveBeenCalled();
    expect(writes.clientEventCreate).not.toHaveBeenCalled();
    expect(writes.statusHistoryCreate).not.toHaveBeenCalled();
    expect(writes.clientUpdate).not.toHaveBeenCalled();
    expect(writes.clientReferenceUpdate).not.toHaveBeenCalled();
  });

  it('does not import pending, expense, invalid, conflict or unchanged payments', async () => {
    const mappedOptions = {
      clients: [{ id: 'client-edilson', name: 'Edilson' }],
      importRecords: [
        {
          crmClientId: 'client-edilson',
          crmClientReferenceId: 'reference-edilson',
          legacyClientId: '2352',
          payloadHash: 'client-hash',
          source: 'legacy',
          status: 'IMPORTED',
        },
      ],
      references: [
        { id: 'reference-edilson', clientId: 'client-edilson', reference: 'edilson7581' },
      ],
    };
    const preview = await createService(mappedOptions).service.previewPayments({
      schemaVersion: 1,
      source: 'legacy',
      payments: [basePayment],
    });
    const { service, writes } = createService({
      ...mappedOptions,
      financialImportRecords: [
        {
          crmClientId: 'client-edilson',
          crmClientReferenceId: 'reference-edilson',
          financialTransactionId: 'transaction-1',
          legacyClientId: '2352',
          legacyPaymentId: '11670',
          payloadHash: preview.rows[0]?.payloadHash,
          receivableId: null,
          status: 'IMPORTED',
        },
        {
          crmClientId: 'client-edilson',
          crmClientReferenceId: 'reference-edilson',
          financialTransactionId: 'missing-transaction',
          legacyClientId: '2352',
          legacyPaymentId: '11674',
          payloadHash: '0'.repeat(64),
          receivableId: null,
          status: 'IMPORTED',
        },
      ],
      financialTransactions: [
        { clientId: 'client-edilson', clientReferenceId: 'reference-edilson', id: 'transaction-1' },
      ],
    });

    const result = await service.importPayments({
      schemaVersion: 1,
      source: 'legacy',
      payments: [
        basePayment,
        { ...basePayment, id: 11671, status: 'PENDENTE' },
        { ...basePayment, id: 11672, tipo_transacao: 'DESPESA' },
        { ...basePayment, id: 11673, valor_debito: '0' },
        { ...basePayment, id: 11674 },
        { ...basePayment, id: 11675, client_id: 9999 },
      ],
    });

    expect(result.summary).toEqual({ failed: 0, imported: 0, requested: 6, skipped: 6 });
    expect(result.rows.map((row) => row.code)).toEqual([
      'UNCHANGED',
      'PENDING_NOT_SUPPORTED',
      'UNSUPPORTED',
      'INVALID',
      'CONFLICT',
      'CLIENT_NOT_IMPORTED',
    ]);
    expect(writes.financialTransactionCreate).not.toHaveBeenCalled();
    expect(writes.legacyFinancialImportRecordCreate).not.toHaveBeenCalled();
    expect(writes.receivableCreate).not.toHaveBeenCalled();
    expect(writes.paymentIntentCreate).not.toHaveBeenCalled();
  });

  it('rolls back the payment transaction when idempotency unique constraint wins a race', async () => {
    const { service, writes } = createService({
      clients: [{ id: 'client-edilson', name: 'Edilson' }],
      importRecords: [
        {
          crmClientId: 'client-edilson',
          crmClientReferenceId: 'reference-edilson',
          legacyClientId: '2352',
          payloadHash: 'client-hash',
          source: 'legacy',
          status: 'IMPORTED',
        },
      ],
      references: [
        { id: 'reference-edilson', clientId: 'client-edilson', reference: 'edilson7581' },
      ],
    });
    writes.legacyFinancialImportRecordCreate.mockRejectedValueOnce(
      Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
    );

    const result = await service.importPayments({
      schemaVersion: 1,
      source: 'legacy',
      payments: [basePayment],
    });

    expect(result.summary).toEqual({ failed: 0, imported: 0, requested: 1, skipped: 1 });
    expect(result.rows[0]).toMatchObject({
      code: 'UNCHANGED',
      legacyPaymentId: '11670',
      result: 'SKIPPED',
    });
    expect(writes.financialTransactionCreate).toHaveBeenCalledTimes(1);
    expect(writes.legacyFinancialImportRecordCreate).toHaveBeenCalledTimes(1);
    expect(writes.receivableCreate).not.toHaveBeenCalled();
    expect(writes.paymentIntentCreate).not.toHaveBeenCalled();
  });

  it('revalidates category and client ownership inside the payment import transaction', async () => {
    const inactiveCategoryRace = createService({
      clients: [{ id: 'client-edilson', name: 'Edilson' }],
      importRecords: [
        {
          crmClientId: 'client-edilson',
          crmClientReferenceId: 'reference-edilson',
          legacyClientId: '2352',
          payloadHash: 'client-hash',
          source: 'legacy',
          status: 'IMPORTED',
        },
      ],
      references: [
        { id: 'reference-edilson', clientId: 'client-edilson', reference: 'edilson7581' },
      ],
    });
    inactiveCategoryRace.prisma.financialCategory.findMany
      .mockResolvedValueOnce([
        { id: 'category-history', name: 'Receita histórica', type: 'ENTRADA', active: true },
      ])
      .mockResolvedValueOnce([
        { id: 'category-history', name: 'Receita histórica', type: 'ENTRADA', active: false },
      ]);

    const categoryResult = await inactiveCategoryRace.service.importPayments({
      schemaVersion: 1,
      source: 'legacy',
      payments: [basePayment],
    });

    expect(categoryResult.summary).toEqual({ failed: 0, imported: 0, requested: 1, skipped: 1 });
    expect(categoryResult.rows[0]).toMatchObject({
      code: 'CATEGORY_CHANGED',
      legacyPaymentId: '11670',
      result: 'SKIPPED',
    });
    expect(inactiveCategoryRace.writes.financialTransactionCreate).not.toHaveBeenCalled();
    expect(inactiveCategoryRace.writes.legacyFinancialImportRecordCreate).not.toHaveBeenCalled();

    const clientRace = createService({
      clients: [{ id: 'client-edilson', name: 'Edilson' }],
      importRecords: [
        {
          crmClientId: 'client-edilson',
          crmClientReferenceId: 'reference-edilson',
          legacyClientId: '2352',
          payloadHash: 'client-hash',
          source: 'legacy',
          status: 'IMPORTED',
        },
      ],
      references: [
        { id: 'reference-edilson', clientId: 'client-edilson', reference: 'edilson7581' },
      ],
    });
    clientRace.prisma.clientReference.findUnique.mockResolvedValueOnce({
      clientId: 'other-client',
      id: 'reference-edilson',
    });

    const clientResult = await clientRace.service.importPayments({
      schemaVersion: 1,
      source: 'legacy',
      payments: [basePayment],
    });

    expect(clientResult.summary).toEqual({ failed: 0, imported: 0, requested: 1, skipped: 1 });
    expect(clientResult.rows[0]).toMatchObject({
      code: 'ORPHAN_LEGACY_CLIENT_MAPPING',
      legacyPaymentId: '11670',
      result: 'SKIPPED',
    });
    expect(clientRace.writes.financialTransactionCreate).not.toHaveBeenCalled();
    expect(clientRace.writes.legacyFinancialImportRecordCreate).not.toHaveBeenCalled();
  });

  it('keeps partial payment batches moving for isolated business failures', async () => {
    const { service, writes } = createService({
      clients: [
        { id: 'client-1', name: 'Cliente 1' },
        { id: 'client-2', name: 'Cliente 2' },
        { id: 'client-3', name: 'Cliente 3' },
      ],
      importRecords: [
        {
          crmClientId: 'client-1',
          crmClientReferenceId: 'reference-1',
          legacyClientId: '1',
          payloadHash: 'client-hash',
          source: 'legacy',
          status: 'IMPORTED',
        },
        {
          crmClientId: 'client-2',
          crmClientReferenceId: 'reference-2',
          legacyClientId: '2',
          payloadHash: 'client-hash',
          source: 'legacy',
          status: 'IMPORTED',
        },
        {
          crmClientId: 'client-3',
          crmClientReferenceId: 'reference-3',
          legacyClientId: '3',
          payloadHash: 'client-hash',
          source: 'legacy',
          status: 'IMPORTED',
        },
      ],
      references: [
        { id: 'reference-1', clientId: 'client-1', reference: 'cliente1' },
        { id: 'reference-2', clientId: 'client-2', reference: 'cliente2' },
        { id: 'reference-3', clientId: 'client-3', reference: 'cliente3' },
      ],
    });

    const result = await service.importPayments({
      schemaVersion: 1,
      source: 'legacy',
      payments: [
        { ...basePayment, id: 1, client_id: 1 },
        { ...basePayment, id: 2, client_id: 2, valor_debito: '0' },
        { ...basePayment, id: 3, client_id: 3 },
      ],
    });

    expect(result.summary).toEqual({ failed: 0, imported: 2, requested: 3, skipped: 1 });
    expect(result.rows.map((row) => row.result)).toEqual(['IMPORTED', 'SKIPPED', 'IMPORTED']);
    expect(writes.financialTransactionCreate).toHaveBeenCalledTimes(2);
    expect(writes.legacyFinancialImportRecordCreate).toHaveBeenCalledTimes(2);
    expect(writes.receivableCreate).not.toHaveBeenCalled();
  });

  it('enforces a 2000 payments limit for the write endpoint', async () => {
    const { service } = createService();

    await expect(
      service.importPayments({
        schemaVersion: 1,
        source: 'legacy',
        payments: Array.from({ length: 2_001 }, (_, index) => ({
          ...basePayment,
          id: index + 1,
          client_id: index + 1,
        })),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('previews Edilson cutover as READY without creating operational data', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-28T12:00:00.000Z'));
    const { service, writes } = createCutoverService();

    const result = await service.previewCutover();

    expect(result).toMatchObject({
      mode: 'READ_ONLY',
      unit: 'CLIENT_REFERENCE',
      purpose: 'RENEWAL',
      summary: { ready: 1, total: 1 },
    });
    expect(result.rows[0]).toMatchObject({
      legacyClientId: '2352',
      reference: 'edilson7581',
      clientStatus: 'ATIVO',
      referenceStatus: 'ATIVO',
      planName: 'Mensal',
      amount: '35.00',
      dueDate: '2026-10-26',
      billingAnchorDay: 26,
      billingNoticeDays: 0,
      purpose: 'RENEWAL',
      classification: 'READY',
      existingReceivable: null,
      errors: [],
    });
    expect(result.rows[0]?.scheduledForEstimated).toBe('2026-10-26T12:00:00.000Z');
    expectNoCutoverWrites(writes);
    vi.useRealTimers();
  });

  it('classifies due today as READY with WARNING_DUE_TODAY', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-26T13:00:00.000Z'));
    const { service } = createCutoverService();

    const result = await service.previewCutover();

    expect(result.rows[0]).toMatchObject({ classification: 'READY' });
    expect(result.rows[0]?.warnings).toContain('WARNING_DUE_TODAY');
    vi.useRealTimers();
  });

  it('classifies past due references as CONFLICT_PAST_DUE_DATE', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-27T12:00:00.000Z'));
    const { service } = createCutoverService();

    const result = await service.previewCutover();

    expect(result.rows[0]).toMatchObject({ classification: 'CONFLICT' });
    expect(result.rows[0]?.errors).toContain('CONFLICT_PAST_DUE_DATE');
    vi.useRealTimers();
  });

  it('uses the Sao Paulo business day near the UTC date boundary', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-27T02:30:00.000Z'));
    const { service } = createCutoverService();

    const result = await service.previewCutover();

    expect(result.rows[0]).toMatchObject({ classification: 'READY' });
    expect(result.rows[0]?.warnings).toContain('WARNING_DUE_TODAY');
    expect(result.rows[0]?.errors).not.toContain('CONFLICT_PAST_DUE_DATE');
    vi.useRealTimers();
  });

  it('keeps future due references READY when notice date already passed', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-25T12:00:00.000Z'));
    const { service } = createCutoverService({
      references: [cutoverReference({ billingNoticeDays: 3 })],
    });

    const result = await service.previewCutover();

    expect(result.rows[0]).toMatchObject({ classification: 'READY' });
    expect(result.rows[0]?.warnings).toContain('WARNING_BILLING_NOTICE_DATE_PASSED');
    vi.useRealTimers();
  });

  it('keeps notice today clean before send time and warns after send time', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-23T11:00:00.000Z'));
    const beforeSend = createCutoverService({
      references: [cutoverReference({ billingNoticeDays: 3 })],
    });

    const beforeResult = await beforeSend.service.previewCutover();

    expect(beforeResult.rows[0]).toMatchObject({ classification: 'READY' });
    expect(beforeResult.rows[0]?.warnings).toContain('WARNING_BILLING_NOTICE_DATE_TODAY');
    expect(beforeResult.rows[0]?.warnings).not.toContain('WARNING_BILLING_NOTICE_DATE_PASSED');

    vi.setSystemTime(new Date('2026-10-23T13:00:00.000Z'));
    const afterSend = createCutoverService({
      references: [cutoverReference({ billingNoticeDays: 3 })],
    });

    const afterResult = await afterSend.service.previewCutover();

    expect(afterResult.rows[0]).toMatchObject({ classification: 'READY' });
    expect(afterResult.rows[0]?.warnings).toContain('WARNING_BILLING_NOTICE_DATE_PASSED');
    vi.useRealTimers();
  });

  it.each([
    ['PENDENTE', 'UNCHANGED', []],
    ['PAGO', 'CONFLICT', ['RECEIVABLE_ALREADY_PAID']],
    ['CANCELADO', 'CONFLICT', ['RECEIVABLE_CANCELED']],
  ])('handles same-cycle %s receivables as %s', async (status, classification, errors) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-28T12:00:00.000Z'));
    const { service } = createCutoverService({
      receivables: [cutoverReceivable({ status })],
    });

    const result = await service.previewCutover();

    expect(result.rows[0]).toMatchObject({ classification, existingReceivable: { status } });
    for (const error of errors) {
      expect(result.rows[0]?.errors).toContain(error);
    }
    vi.useRealTimers();
  });

  it('blocks divergent pending renewal receivables', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-28T12:00:00.000Z'));
    const { service } = createCutoverService({
      receivables: [cutoverReceivable({ dueDate: new Date('2026-11-26T00:00:00.000Z') })],
    });

    const result = await service.previewCutover();

    expect(result.rows[0]).toMatchObject({ classification: 'CONFLICT' });
    expect(result.rows[0]?.errors).toContain('RECEIVABLE_DIVERGENT');
    vi.useRealTimers();
  });

  it('does not mark same-cycle pending receivables with a wrong amount as unchanged', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-28T12:00:00.000Z'));
    const { service } = createCutoverService({
      receivables: [cutoverReceivable({ amount: new Prisma.Decimal('30.00') })],
    });

    const result = await service.previewCutover();

    expect(result.rows[0]).toMatchObject({ classification: 'CONFLICT' });
    expect(result.rows[0]?.errors).toContain('RECEIVABLE_DIVERGENT');
    vi.useRealTimers();
  });

  it('flags same-date receivables with a wrong purpose as operational conflicts', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-28T12:00:00.000Z'));
    const { service } = createCutoverService({
      receivables: [cutoverReceivable({ purpose: 'INITIAL_ACTIVATION' })],
    });

    const result = await service.previewCutover();

    expect(result.rows[0]).toMatchObject({ classification: 'CONFLICT' });
    expect(result.rows[0]?.errors).toContain('RECEIVABLE_DIVERGENT');
    vi.useRealTimers();
  });

  it.each([
    [{ status: 'INATIVO' }, {}, 'CLIENT_NOT_ACTIVE'],
    [{}, { status: 'INATIVO' }, 'REFERENCE_NOT_ACTIVE'],
    [{}, { recurringValue: new Prisma.Decimal('0.00') }, 'INVALID_RECURRING_VALUE'],
    [{}, { billingNoticeDays: -1 }, 'INVALID_BILLING_NOTICE_DAYS'],
  ])('reports cutover validation code %s', async (clientOverrides, referenceOverrides, code) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-28T12:00:00.000Z'));
    const { service } = createCutoverService({
      clients: [cutoverClient(clientOverrides)],
      references: [cutoverReference(referenceOverrides)],
    });

    const result = await service.previewCutover();

    expect([...result.rows[0]!.errors, ...result.rows[0]!.warnings]).toContain(code);
    vi.useRealTimers();
  });

  it('keeps two active references as independent cutover rows', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-28T12:00:00.000Z'));
    const { service } = createCutoverService({
      importRecords: [
        cutoverImportRecord(),
        cutoverImportRecord({
          legacyClientId: '2353',
          crmClientReferenceId: 'reference-second',
        }),
      ],
      references: [
        cutoverReference(),
        cutoverReference({
          id: 'reference-second',
          reference: 'edilson7582',
          dueDate: new Date('2026-11-26T00:00:00.000Z'),
        }),
      ],
    });

    const result = await service.previewCutover();

    expect(result.summary).toMatchObject({ ready: 2, total: 2 });
    expect(result.rows.map((row) => row.reference)).toEqual(['edilson7581', 'edilson7582']);
    vi.useRealTimers();
  });

  it('does not require legacy financial history and reports dispatch warnings separately', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-28T12:00:00.000Z'));
    const { service } = createCutoverService({
      clients: [cutoverClient({ phoneNormalized: '123' })],
      whatsAppConnection: null,
    });

    const result = await service.previewCutover();

    expect(result.rows[0]).toMatchObject({
      classification: 'READY',
      dispatchReady: false,
    });
    expect(result.rows[0]?.warnings).toEqual(
      expect.arrayContaining(['WARNING_INVALID_PHONE_FOR_DISPATCH', 'WARNING_WHATSAPP_NOT_READY']),
    );
    expect(result.summary.warnings).toBe(1);
    vi.useRealTimers();
  });

  it('keeps cutover classification independent from imported financial history volume', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-28T12:00:00.000Z'));
    const withNoHistory = createCutoverService();
    const withLargeHistory = createCutoverService({
      financialTransactions: Array.from({ length: 100 }, (_, index) => ({
        id: `legacy-history-${index}`,
        clientId: 'client-edilson',
        clientReferenceId: 'reference-edilson',
      })),
    });

    const noHistoryResult = await withNoHistory.service.previewCutover();
    const largeHistoryResult = await withLargeHistory.service.previewCutover();

    expect(noHistoryResult.rows[0]).toMatchObject({ classification: 'READY' });
    expect(largeHistoryResult.rows[0]).toMatchObject({ classification: 'READY' });
    expect(largeHistoryResult.rows[0]).toMatchObject({
      amount: '35.00',
      dueDate: '2026-10-26',
    });
    vi.useRealTimers();
  });

  it('activates READY cutover references by creating only the renewal receivable', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-28T12:00:00.000Z'));
    const { receivableCycleService, service, writes } = createCutoverService();

    const result = await service.activateCutover({ clientReferenceIds: ['reference-edilson'] });

    expect(result).toMatchObject({
      mode: 'CONTROLLED_ACTIVATION',
      unit: 'CLIENT_REFERENCE',
      purpose: 'RENEWAL',
      summary: { requested: 1, created: 1, unchanged: 0, skipped: 0, failed: 0 },
    });
    expect(result.rows[0]).toMatchObject({
      legacyClientId: '2352',
      crmClientId: 'client-edilson',
      crmClientReferenceId: 'reference-edilson',
      reference: 'edilson7581',
      result: 'CREATED',
      receivableId: 'receivable-reference-edilson',
      code: 'CREATED',
    });
    expect(receivableCycleService.ensureCurrentCycleReceivable).toHaveBeenCalledWith(
      'reference-edilson',
      expect.objectContaining({
        expectedClientId: 'client-edilson',
        rejectPastDue: true,
        requireClientActive: true,
        requirePlanActive: true,
      }),
    );
    expectNoOperationalSideEffects(writes);
    vi.useRealTimers();
  });

  it('treats replayed cutover activation as UNCHANGED without another write request', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-28T12:00:00.000Z'));
    const { receivableCycleService, service } = createCutoverService({
      receivables: [cutoverReceivable()],
    });

    const result = await service.activateCutover({ clientReferenceIds: ['reference-edilson'] });

    expect(result.summary).toMatchObject({ requested: 1, created: 0, unchanged: 1 });
    expect(result.rows[0]).toMatchObject({
      result: 'UNCHANGED',
      receivableId: 'receivable-edilson',
      code: 'UNCHANGED',
    });
    expect(receivableCycleService.ensureCurrentCycleReceivable).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('can activate an explicitly selected unchanged reference idempotently', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-28T12:00:00.000Z'));
    const { receivableCycleService, service } = createCutoverService({
      receivables: [cutoverReceivable()],
    });

    const result = await service.activateCutover({ clientReferenceIds: ['reference-edilson'] });

    expect(result.summary).toMatchObject({ requested: 1, created: 0, unchanged: 1 });
    expect(result.rows[0]).toMatchObject({
      result: 'UNCHANGED',
      receivableId: 'receivable-edilson',
      code: 'UNCHANGED',
    });
    expect(receivableCycleService.ensureCurrentCycleReceivable).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('blocks cutover activation when billing or recovery schedulers are effectively enabled', async () => {
    const { service } = createCutoverService({ billingSchedulerEnabled: undefined });

    try {
      await service.activateCutover({});
      throw new Error('Expected cutover activation to be blocked.');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      const response: unknown = (error as BadRequestException).getResponse();
      expect(response).toMatchObject({ code: 'SCHEDULERS_MUST_BE_DISABLED' });
    }
  });

  it.each([
    ['billing true', { billingSchedulerEnabled: 'true', recoverySchedulerEnabled: 'false' }],
    ['recovery true', { billingSchedulerEnabled: 'false', recoverySchedulerEnabled: 'true' }],
    [
      'billing undefined',
      { billingSchedulerEnabled: undefined, recoverySchedulerEnabled: 'false' },
    ],
    [
      'recovery undefined',
      { billingSchedulerEnabled: 'false', recoverySchedulerEnabled: undefined },
    ],
    ['both undefined', { billingSchedulerEnabled: undefined, recoverySchedulerEnabled: undefined }],
    ['billing TRUE', { billingSchedulerEnabled: 'TRUE', recoverySchedulerEnabled: 'false' }],
    ['mixed case false', { billingSchedulerEnabled: 'FALSE', recoverySchedulerEnabled: 'false' }],
    [
      'recovery mixed case false',
      { billingSchedulerEnabled: 'false', recoverySchedulerEnabled: 'FALSE' },
    ],
    ['billing zero', { billingSchedulerEnabled: '0', recoverySchedulerEnabled: 'false' }],
    ['empty billing', { billingSchedulerEnabled: '', recoverySchedulerEnabled: 'false' }],
  ])('blocks cutover activation when scheduler env is not exactly false: %s', async (_, config) => {
    const { receivableCycleService, service, writes } = createCutoverService(config);

    await expect(service.activateCutover({})).rejects.toBeInstanceOf(BadRequestException);

    expect(receivableCycleService.ensureCurrentCycleReceivable).not.toHaveBeenCalled();
    expectNoOperationalSideEffects(writes);
  });

  it('allows cutover activation when both schedulers are exactly false', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-28T12:00:00.000Z'));
    const { service } = createCutoverService({
      billingSchedulerEnabled: 'false',
      recoverySchedulerEnabled: 'false',
    });

    const result = await service.activateCutover({ clientReferenceIds: ['reference-edilson'] });

    expect(result.summary).toMatchObject({ requested: 1, created: 1 });
    vi.useRealTimers();
  });

  it('rejects more than 500 selected references before any receivable write', async () => {
    const { receivableCycleService, service, writes } = createCutoverService();

    try {
      await service.activateCutover({
        clientReferenceIds: Array.from({ length: 501 }, (_, index) => `reference-${index}`),
      });
      throw new Error('Expected cutover activation to reject over-limit batches.');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      const response: unknown = (error as BadRequestException).getResponse();
      expect(response).toMatchObject({ code: 'CUTOVER_BATCH_LIMIT_EXCEEDED' });
    }

    expect(receivableCycleService.ensureCurrentCycleReceivable).not.toHaveBeenCalled();
    expectNoOperationalSideEffects(writes);
  });

  it('accepts a 500-reference activation selection limit', async () => {
    const { service } = createCutoverService();

    const result = await service.activateCutover({
      clientReferenceIds: Array.from({ length: 500 }, (_, index) => `reference-${index}`),
    });

    expect(result.summary).toMatchObject({ requested: 500, created: 0, skipped: 500 });
  });

  it('does not activate all ready references for an empty cutover selection', async () => {
    const { receivableCycleService, service } = createCutoverService();

    const result = await service.activateCutover({ clientReferenceIds: [] });

    expect(result.summary).toMatchObject({ requested: 0, created: 0, skipped: 0 });
    expect(result.rows).toEqual([]);
    expect(receivableCycleService.ensureCurrentCycleReceivable).not.toHaveBeenCalled();
  });

  it('does not treat an omitted cutover selection as activate all', async () => {
    const { receivableCycleService, service } = createCutoverService();

    const result = await service.activateCutover({});

    expect(result.summary).toMatchObject({ requested: 0, created: 0, skipped: 0 });
    expect(result.rows).toEqual([]);
    expect(receivableCycleService.ensureCurrentCycleReceivable).not.toHaveBeenCalled();
  });

  it('rejects array payloads instead of treating them as activate all', async () => {
    const { receivableCycleService, service } = createCutoverService();

    await expect(service.activateCutover([])).rejects.toBeInstanceOf(BadRequestException);

    expect(receivableCycleService.ensureCurrentCycleReceivable).not.toHaveBeenCalled();
  });

  it('rejects frontend authority fields in cutover activation payloads', async () => {
    const { receivableCycleService, service } = createCutoverService();

    await expect(
      service.activateCutover({
        amount: '35.00',
        classification: 'READY',
        clientReferenceIds: ['reference-edilson'],
        dueDate: '2026-10-26',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(receivableCycleService.ensureCurrentCycleReceivable).not.toHaveBeenCalled();
  });

  it('deduplicates repeated cutover reference ids before processing', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-28T12:00:00.000Z'));
    const { receivableCycleService, service } = createCutoverService();

    const result = await service.activateCutover({
      clientReferenceIds: ['reference-edilson', 'reference-edilson', 'reference-edilson'],
    });

    expect(result.summary).toMatchObject({ requested: 1, created: 1 });
    expect(receivableCycleService.ensureCurrentCycleReceivable).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('skips unknown cutover reference ids without writes', async () => {
    const { receivableCycleService, service } = createCutoverService();

    const result = await service.activateCutover({ clientReferenceIds: ['reference-unknown'] });

    expect(result.summary).toMatchObject({ requested: 1, created: 0, skipped: 1 });
    expect(result.rows[0]).toMatchObject({
      crmClientReferenceId: 'reference-unknown',
      result: 'SKIPPED',
      code: 'NOT_FOUND',
    });
    expect(receivableCycleService.ensureCurrentCycleReceivable).not.toHaveBeenCalled();
  });

  it('activates only the requested ready reference when preview has multiple ready rows', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-28T12:00:00.000Z'));
    const { receivableCycleService, service } = createCutoverService({
      clients: [
        cutoverClient({ id: 'client-a', name: 'Cliente A' }),
        cutoverClient({ id: 'client-b', name: 'Cliente B' }),
      ],
      importRecords: [
        cutoverImportRecord({
          legacyClientId: '2352',
          crmClientId: 'client-a',
          crmClientReferenceId: 'reference-a',
        }),
        cutoverImportRecord({
          legacyClientId: '2353',
          crmClientId: 'client-b',
          crmClientReferenceId: 'reference-b',
        }),
      ],
      references: [
        cutoverReference({ id: 'reference-a', clientId: 'client-a', reference: 'cliente-a' }),
        cutoverReference({ id: 'reference-b', clientId: 'client-b', reference: 'cliente-b' }),
      ],
    });

    const result = await service.activateCutover({ clientReferenceIds: ['reference-b'] });

    expect(result.summary).toMatchObject({ requested: 1, created: 1 });
    expect(receivableCycleService.ensureCurrentCycleReceivable).toHaveBeenCalledTimes(1);
    expect(receivableCycleService.ensureCurrentCycleReceivable).toHaveBeenCalledWith(
      'reference-b',
      expect.objectContaining({
        expectedClientId: 'client-b',
        rejectPastDue: true,
        requireClientActive: true,
        requirePlanActive: true,
      }),
    );
    vi.useRealTimers();
  });

  it('revalidates past due references during activation and skips without creating', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-27T12:00:00.000Z'));
    const { receivableCycleService, service } = createCutoverService();

    const result = await service.activateCutover({ clientReferenceIds: ['reference-edilson'] });

    expect(result.summary).toMatchObject({ requested: 1, created: 0, skipped: 1 });
    expect(result.rows[0]).toMatchObject({
      result: 'SKIPPED',
      code: 'CONFLICT_PAST_DUE_DATE',
    });
    expect(receivableCycleService.ensureCurrentCycleReceivable).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('handles expected receivable race conflicts as SKIPPED instead of HTTP 500', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-28T12:00:00.000Z'));
    const { service } = createCutoverService({
      receivableCycleError: new ConflictException(
        'Ciclo financeiro possui conta a receber conflitante.',
      ),
    });

    const result = await service.activateCutover({ clientReferenceIds: ['reference-edilson'] });

    expect(result.summary).toMatchObject({ requested: 1, created: 0, skipped: 1 });
    expect(result.rows[0]).toMatchObject({ result: 'SKIPPED', code: 'CONFLICT' });
    vi.useRealTimers();
  });

  it('surfaces domain conflict codes from the final cutover guard', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-28T12:00:00.000Z'));
    const { service } = createCutoverService({
      receivableCycleError: new ConflictException({
        code: 'PLAN_INACTIVE',
        message: 'Plano da referencia nao esta ativo para gerar conta a receber.',
      }),
    });

    const result = await service.activateCutover({ clientReferenceIds: ['reference-edilson'] });

    expect(result.summary).toMatchObject({ requested: 1, created: 0, skipped: 1 });
    expect(result.rows[0]).toMatchObject({
      result: 'SKIPPED',
      code: 'PLAN_INACTIVE',
      message: 'Plano da referencia nao esta ativo para gerar conta a receber.',
    });
    vi.useRealTimers();
  });

  it('keeps partial cutover batches moving for isolated business conflicts', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-28T12:00:00.000Z'));
    const { service } = createCutoverService({
      clients: [
        cutoverClient({ id: 'client-a', name: 'Cliente A' }),
        cutoverClient({ id: 'client-b', name: 'Cliente B' }),
        cutoverClient({ id: 'client-c', name: 'Cliente C' }),
      ],
      importRecords: [
        cutoverImportRecord({
          legacyClientId: '2352',
          crmClientId: 'client-a',
          crmClientReferenceId: 'reference-a',
        }),
        cutoverImportRecord({
          legacyClientId: '2353',
          crmClientId: 'client-b',
          crmClientReferenceId: 'reference-b',
        }),
        cutoverImportRecord({
          legacyClientId: '2354',
          crmClientId: 'client-c',
          crmClientReferenceId: 'reference-c',
        }),
      ],
      references: [
        cutoverReference({ id: 'reference-a', clientId: 'client-a', reference: 'cliente-a' }),
        cutoverReference({ id: 'reference-b', clientId: 'client-b', reference: 'cliente-b' }),
        cutoverReference({ id: 'reference-c', clientId: 'client-c', reference: 'cliente-c' }),
      ],
      receivableCycleHandler: (clientReferenceId) => {
        if (clientReferenceId === 'reference-b') {
          throw new ConflictException('Conflito de negocio isolado.');
        }

        return {
          action: 'created',
          receivable: { id: `receivable-${clientReferenceId}` },
        };
      },
    });

    const result = await service.activateCutover({
      clientReferenceIds: ['reference-a', 'reference-b', 'reference-c'],
    });

    expect(result.summary).toMatchObject({ requested: 3, created: 2, skipped: 1 });
    expect(result.rows.map((row) => row.result)).toEqual(['CREATED', 'SKIPPED', 'CREATED']);
    vi.useRealTimers();
  });

  it('does not convert systemic cutover failures into skipped rows', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-28T12:00:00.000Z'));
    const { service } = createCutoverService({
      receivableCycleError: new Error('Prisma engine failure'),
    });

    await expect(
      service.activateCutover({ clientReferenceIds: ['reference-edilson'] }),
    ).rejects.toThrow('Prisma engine failure');
    vi.useRealTimers();
  });

  it('flags duplicate legacy mappings without returning duplicate READY rows', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-28T12:00:00.000Z'));
    const { service } = createCutoverService({
      importRecords: [cutoverImportRecord(), cutoverImportRecord({ legacyClientId: '9999' })],
    });

    const result = await service.previewCutover();

    expect(result.summary).toMatchObject({ conflict: 2, ready: 0 });
    expect(result.rows.every((row) => row.errors.includes('DUPLICATE_LEGACY_MAPPING'))).toBe(true);
    vi.useRealTimers();
  });

  it('previews 1000 cutover references with batched lookups and no N+1 queries', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-28T12:00:00.000Z'));
    const size = 1_000;
    const { prisma, service } = createCutoverService({
      clients: Array.from({ length: size }, (_, index) =>
        cutoverClient({
          id: `client-${index}`,
          name: `Cliente ${index}`,
          phoneNormalized: `55449999${String(index).padStart(6, '0')}`,
        }),
      ),
      importRecords: Array.from({ length: size }, (_, index) =>
        cutoverImportRecord({
          legacyClientId: String(10_000 + index),
          crmClientId: `client-${index}`,
          crmClientReferenceId: `reference-${index}`,
        }),
      ),
      references: Array.from({ length: size }, (_, index) =>
        cutoverReference({
          id: `reference-${index}`,
          clientId: `client-${index}`,
          reference: `cliente${index}`,
        }),
      ),
    });

    const result = await service.previewCutover();

    expect(result.summary).toMatchObject({ ready: size, total: size });
    expect(prisma.legacyImportRecord.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.client.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.clientReference.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.receivable.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.plan.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.messageTemplate.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.whatsAppConnection.findFirst).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
