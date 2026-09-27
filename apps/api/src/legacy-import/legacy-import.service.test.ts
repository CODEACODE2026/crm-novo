import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
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

const defaultPlanMapping = {
  ANUAL: 'plan-12',
  BIMESTRAL: 'plan-2',
  MENSAL: 'plan-1',
  SEMESTRAL: 'plan-6',
  TRIMESTRAL: 'plan-3',
};

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
    clients?: unknown[];
    importRecords?: unknown[];
    plans?: unknown[];
    references?: unknown[];
  } = {},
) {
  const writes = {
    clientCreate: vi.fn(),
    clientEventCreate: vi.fn(),
    clientReferenceUpdate: vi.fn(),
    clientReferenceCreate: vi.fn(),
    financialTransactionCreate: vi.fn(),
    legacyImportRecordCreate: vi.fn(),
    legacyImportRecordUpdate: vi.fn(),
    legacyImportRecordUpsert: vi.fn(),
    messageDispatchCreate: vi.fn(),
    messageDispatchUpdate: vi.fn(),
    paymentIntentCreate: vi.fn(),
    paymentIntentUpdate: vi.fn(),
    receivableCreate: vi.fn(),
    receivableUpdate: vi.fn(),
    statusHistoryCreate: vi.fn(),
    clientUpdate: vi.fn(),
  };
  const prisma = {
    $transaction: vi.fn((operations: Array<Promise<unknown>>) => Promise.all(operations)),
    client: {
      create: writes.clientCreate,
      findMany: vi.fn(() => Promise.resolve(options.clients ?? [])),
      update: writes.clientUpdate,
    },
    clientReference: {
      create: writes.clientReferenceCreate,
      findMany: vi.fn(() => Promise.resolve(options.references ?? [])),
      update: writes.clientReferenceUpdate,
    },
    clientEvent: { create: writes.clientEventCreate },
    financialTransaction: { create: writes.financialTransactionCreate },
    legacyImportRecord: {
      create: writes.legacyImportRecordCreate,
      findMany: vi.fn(() => Promise.resolve(options.importRecords ?? [])),
      update: writes.legacyImportRecordUpdate,
      upsert: writes.legacyImportRecordUpsert,
    },
    messageDispatch: { create: writes.messageDispatchCreate, update: writes.messageDispatchUpdate },
    paymentIntent: { create: writes.paymentIntentCreate, update: writes.paymentIntentUpdate },
    plan: {
      findMany: vi.fn(() =>
        Promise.resolve(
          options.plans ?? [
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
          ],
        ),
      ),
    },
    receivable: { create: writes.receivableCreate, update: writes.receivableUpdate },
    statusHistory: { create: writes.statusHistoryCreate },
  };

  return { prisma, service: new LegacyImportService(prisma as never), writes };
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
        'DUPLICATE_REFERENCE_IN_FILE',
      ]),
    );
    expect(result.rows[1]?.classification).toBe('CONFLICT');
    expect(result.rows[1]?.errors).toEqual(
      expect.arrayContaining(['DUPLICATE_LEGACY_ID_IN_FILE', 'DUPLICATE_REFERENCE_IN_FILE']),
    );
  });

  it('keeps INVALID precedence over NEEDS_DECISION when ambiguous statuses also have invalid fields', async () => {
    const { service } = createService();

    const result = await service.previewClients(
      envelope([
        { ...baseClient, id: 1, status: 'Novo', phone: '123', referencia: 'novo-invalid' },
      ]),
    );

    expect(result.rows[0]?.classification).toBe('INVALID');
    expect(result.rows[0]?.errors).toContain('INVALID_PHONE');
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
});
