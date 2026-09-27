import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ClientStatus } from '@prisma/client';
import { createHash } from 'node:crypto';
import {
  formatBusinessDate,
  getBusinessDateDay,
  parseBusinessDate,
} from '../clients/utils/business-date';
import { normalizeBrazilPhone } from '../clients/utils/phone-normalizer';
import { PrismaService } from '../common/prisma/prisma.service';

const maxClientsPerPreview = 10_000;
const maxUnsignedBigInt = 18_446_744_073_709_551_615n;
const source = 'legacy';
const orphanLegacyMappingMessage =
  'Existe um vínculo de importação anterior, mas o cliente ou referência associado não está mais disponível ou está inconsistente.';
const ignoredLegacyFields = [
  'cpf',
  'cobrar',
  'preferencia',
  'is_processing',
  'user_id',
  'msg_enviar',
] as const;

const billingCycleMonths = {
  ANUAL: 12,
  BIMESTRAL: 2,
  MENSAL: 1,
  SEMESTRAL: 6,
  TRIMESTRAL: 3,
} as const;

const legacyStatusMap = {
  Ativo: 'ATIVO',
  Cancelado: 'CANCELADO',
  Inativo: 'INATIVO',
} satisfies Record<string, ClientStatus>;

type LegacyImportClassification =
  | 'READY_CREATE'
  | 'READY_UPDATE'
  | 'UNCHANGED'
  | 'POSSIBLE_MATCH'
  | 'NEEDS_DECISION'
  | 'CONFLICT'
  | 'INVALID';

type CandidateMatch = {
  field: 'reference' | 'phone' | 'email' | 'name';
  clientId: string;
  clientName: string;
  clientReferenceId?: string | null;
  reference?: string | null;
};

type NormalizedLegacyClient = {
  billingAnchorDay: number | null;
  billingNoticeDays: number | null;
  dueDate: Date | null;
  dueDateText: string | null;
  email: string | null;
  legacyClientId: string | null;
  legacyCreatedAt: string | null;
  legacyDisabledAt: string | null;
  legacyStatus: string | null;
  legacyUpdatedAt: string | null;
  name: string | null;
  notes: string | null;
  phone: string | null;
  phoneNormalized: string | null;
  planDurationMonths: number | null;
  planName: string | null;
  rawReference: string | null;
  recurringValue: string | null;
  status: ClientStatus | null;
};

type LegacyClientInput = Record<string, unknown>;
type LegacyImportRecordLookup = {
  legacyClientId: string;
  payloadHash: string;
  crmClientId: string | null;
  crmClientReferenceId: string | null;
};
type ClientIdLookup = { id: string };
type ClientReferenceIdLookup = { id: string; clientId: string };

@Injectable()
export class LegacyImportService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async previewClients(payload: unknown) {
    const envelope = this.parseEnvelope(payload);
    const normalizedRows = envelope.clients.map((client, index) => ({
      index,
      input: client,
      normalized: this.normalizeClient(client),
      errors: [] as string[],
      warnings: [] as string[],
    }));

    this.markDuplicateLegacyIds(normalizedRows);
    this.markDuplicateReferences(normalizedRows);

    const lookups = await this.loadLookups(normalizedRows);

    const rows = normalizedRows.map((row) => {
      const errors = [...row.normalized.errors, ...row.errors];
      const warnings = [...row.normalized.warnings, ...row.warnings];
      const normalized = row.normalized.value;
      const planMatch = this.resolvePlan(
        normalized.planDurationMonths,
        lookups.plansByDuration,
        errors,
      );
      const importRecord = normalized.legacyClientId
        ? (lookups.importRecords.get(normalized.legacyClientId) ?? null)
        : null;
      const candidateMatches = this.findCandidateMatches(normalized, lookups);
      this.validateExistingLegacyMapping(importRecord, lookups, errors, warnings);
      const payloadHash =
        errors.some((error) => error.startsWith('INVALID_')) || normalized.legacyClientId === null
          ? null
          : this.hashNormalizedPayload(normalized, planMatch?.id ?? null);

      if (this.hasExistingReferenceWithoutImportRecord(candidateMatches, importRecord)) {
        warnings.push('REFERENCE_MATCH');
      }

      if (candidateMatches.some((match) => match.field === 'phone')) {
        warnings.push('PHONE_MATCH');
      }

      if (candidateMatches.some((match) => match.field === 'email')) {
        warnings.push('EMAIL_MATCH');
      }

      const classification = this.classify({
        candidateMatches,
        errors,
        importRecord,
        normalized,
        payloadHash,
      });

      return {
        index: row.index,
        legacyClientId: normalized.legacyClientId,
        name: normalized.name,
        reference: normalized.rawReference,
        status: normalized.legacyStatus,
        normalizedStatus: normalized.status,
        phone: normalized.phone,
        phoneNormalized: normalized.phoneNormalized,
        email: normalized.email,
        plan: planMatch
          ? {
              id: planMatch.id,
              name: planMatch.name,
              durationMonths: planMatch.durationMonths,
            }
          : normalized.planDurationMonths
            ? { durationMonths: normalized.planDurationMonths, id: null, name: null }
            : null,
        recurringValue: normalized.recurringValue,
        dueDate: normalized.dueDateText,
        billingAnchorDay: normalized.billingAnchorDay,
        billingNoticeDays: normalized.billingNoticeDays,
        legacyCreatedAt: normalized.legacyCreatedAt,
        legacyUpdatedAt: normalized.legacyUpdatedAt,
        legacyDisabledAt: normalized.legacyDisabledAt,
        payloadHash,
        classification,
        errors: this.unique(errors),
        warnings: this.unique(warnings),
        candidateMatches: this.uniqueCandidateMatches(candidateMatches),
      };
    });

    return {
      summary: this.summarize(rows),
      ignoredFields: ignoredLegacyFields,
      rows,
    };
  }

  private parseEnvelope(payload: unknown) {
    if (!this.isRecord(payload)) {
      throw new BadRequestException('INVALID_JSON_ENVELOPE');
    }

    if (payload.schemaVersion !== 1) {
      throw new BadRequestException('UNSUPPORTED_SCHEMA_VERSION');
    }

    if (payload.source !== source) {
      throw new BadRequestException('INVALID_SOURCE');
    }

    if (!Array.isArray(payload.clients)) {
      throw new BadRequestException('INVALID_CLIENTS_ARRAY');
    }

    if (payload.clients.length > maxClientsPerPreview) {
      throw new BadRequestException('CLIENTS_LIMIT_EXCEEDED');
    }

    return {
      clients: payload.clients.map((client) => {
        if (!this.isRecord(client)) {
          return {};
        }

        return client;
      }),
    };
  }

  private normalizeClient(input: LegacyClientInput) {
    const errors: string[] = [];
    const warnings: string[] = [];
    const legacyClientId = this.normalizeLegacyClientId(input.id, errors);
    const name = this.normalizeName(input.name, errors);
    const phone = this.optionalString(input.phone)?.trim() || null;
    const phoneNormalized = this.normalizePhone(phone, errors);
    const email = this.normalizeEmail(input.email, errors);
    const legacyStatus = this.optionalString(input.status)?.trim() || null;
    const status = this.normalizeStatus(legacyStatus, errors);
    const dueDateText = this.optionalString(input.vencimento)?.trim() || null;
    const dueDate = this.normalizeDueDate(dueDateText, errors, warnings);
    const billingNoticeDays = this.normalizeBillingNoticeDays(input.avisar, errors);
    const recurringValue = this.normalizeRecurringValue(input.value_mensalidade, errors);
    const planDurationMonths = this.normalizeBillingCycle(input.type_cobranca, errors);
    const reference = this.optionalString(input.referencia)?.trim() || null;
    const notes = this.optionalString(input.observation)?.trim() || null;

    if (!reference) {
      errors.push('INVALID_REFERENCE');
    }

    const value: NormalizedLegacyClient = {
      billingAnchorDay: dueDate ? getBusinessDateDay(dueDate) : null,
      billingNoticeDays,
      dueDate,
      dueDateText,
      email,
      legacyClientId,
      legacyCreatedAt: this.optionalString(input.created_at)?.trim() || null,
      legacyDisabledAt: this.optionalString(input.date_desativado)?.trim() || null,
      legacyStatus,
      legacyUpdatedAt: this.optionalString(input.updated_at)?.trim() || null,
      name,
      notes,
      phone,
      phoneNormalized,
      planDurationMonths,
      planName: this.optionalString(input.type_cobranca)?.trim() || null,
      rawReference: reference,
      recurringValue,
      status,
    };

    return { errors, value, warnings };
  }

  private normalizeLegacyClientId(value: unknown, errors: string[]) {
    if (typeof value === 'number') {
      if (!Number.isSafeInteger(value) || value <= 0) {
        errors.push('INVALID_LEGACY_ID');
        return null;
      }

      return String(value);
    }

    if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
      const parsed = BigInt(value.trim());

      if (parsed <= 0n || parsed > maxUnsignedBigInt) {
        errors.push('INVALID_LEGACY_ID');
        return null;
      }

      return parsed.toString();
    }

    errors.push('INVALID_LEGACY_ID');
    return null;
  }

  private normalizeName(value: unknown, errors: string[]) {
    const name = this.optionalString(value)?.trim();

    if (!name || name.length < 2) {
      errors.push('INVALID_NAME');
      return null;
    }

    if (name.length > 255) {
      errors.push('INVALID_NAME');
      return null;
    }

    return name;
  }

  private normalizePhone(value: string | null, errors: string[]) {
    if (!value) {
      errors.push('INVALID_PHONE');
      return null;
    }

    try {
      return normalizeBrazilPhone(value);
    } catch {
      errors.push('INVALID_PHONE');
      return null;
    }
  }

  private normalizeEmail(value: unknown, errors: string[]) {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const email = this.optionalString(value)?.trim().toLowerCase();

    if (!email) {
      return null;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) {
      errors.push('INVALID_EMAIL');
      return null;
    }

    return email;
  }

  private normalizeStatus(value: string | null, errors: string[]) {
    if (!value) {
      errors.push('INVALID_STATUS');
      return null;
    }

    if (value === 'Novo' || value === 'Pendente') {
      return null;
    }

    const status = legacyStatusMap[value as keyof typeof legacyStatusMap];

    if (!status) {
      errors.push('INVALID_STATUS');
      return null;
    }

    return status;
  }

  private normalizeDueDate(value: string | null, errors: string[], warnings: string[]) {
    if (!value) {
      errors.push('INVALID_DUE_DATE');
      return null;
    }

    try {
      const date = parseBusinessDate(value);
      if (formatBusinessDate(date) < formatBusinessDate(new Date())) {
        warnings.push('WARNING_PAST_DUE_DATE');
      }

      return date;
    } catch {
      errors.push('INVALID_DUE_DATE');
      return null;
    }
  }

  private normalizeBillingNoticeDays(value: unknown, errors: string[]) {
    const parsed = this.parseInteger(value);

    if (parsed === null || parsed < 0) {
      errors.push('INVALID_BILLING_NOTICE_DAYS');
      return null;
    }

    return parsed;
  }

  private normalizeRecurringValue(value: unknown, errors: string[]) {
    const text =
      typeof value === 'number'
        ? value.toFixed(2)
        : typeof value === 'string'
          ? value.trim().replace(',', '.')
          : null;

    if (!text || !/^\d+(\.\d{1,2})?$/.test(text)) {
      errors.push('INVALID_RECURRING_VALUE');
      return null;
    }

    const [whole = '0', decimal = ''] = text.split('.');
    const cents = BigInt(whole) * 100n + BigInt(decimal.padEnd(2, '0'));

    if (cents <= 0n || cents > 999_999_999_999n) {
      errors.push('INVALID_RECURRING_VALUE');
      return null;
    }

    return `${whole}.${decimal.padEnd(2, '0')}`;
  }

  private normalizeBillingCycle(value: unknown, errors: string[]) {
    const cycle = this.optionalString(value)?.trim().toUpperCase();

    if (!cycle || !(cycle in billingCycleMonths)) {
      errors.push('INVALID_PLAN');
      return null;
    }

    return billingCycleMonths[cycle as keyof typeof billingCycleMonths];
  }

  private async loadLookups(
    rows: Array<{ normalized: ReturnType<LegacyImportService['normalizeClient']> }>,
  ) {
    const legacyIds = this.unique(
      rows
        .map((row) => row.normalized.value.legacyClientId)
        .filter((id): id is string => Boolean(id)),
    );
    const references = this.unique(
      rows
        .map((row) => row.normalized.value.rawReference)
        .filter((item): item is string => Boolean(item)),
    );
    const phones = this.unique(
      rows
        .map((row) => row.normalized.value.phoneNormalized)
        .filter((item): item is string => Boolean(item)),
    );
    const emails = this.unique(
      rows.map((row) => row.normalized.value.email).filter((item): item is string => Boolean(item)),
    );
    const names = this.unique(
      rows.map((row) => row.normalized.value.name).filter((item): item is string => Boolean(item)),
    );

    const [plans, importRecords, referenceMatches, clientMatches] = await this.prisma.$transaction([
      this.prisma.plan.findMany({ where: { active: true } }),
      legacyIds.length
        ? this.prisma.legacyImportRecord.findMany({
            where: { source, legacyClientId: { in: legacyIds } },
          })
        : this.prisma.legacyImportRecord.findMany({ where: { id: { in: [] } } }),
      references.length
        ? this.prisma.clientReference.findMany({
            where: { reference: { in: references } },
            include: { client: true },
          })
        : this.prisma.clientReference.findMany({
            where: { id: { in: [] } },
            include: { client: true },
          }),
      phones.length || emails.length || names.length
        ? this.prisma.client.findMany({
            where: {
              OR: [
                ...(phones.length ? [{ phoneNormalized: { in: phones } }] : []),
                ...(emails.length ? [{ email: { in: emails } }] : []),
                ...(names.length ? [{ name: { in: names } }] : []),
              ],
            },
            include: { references: { orderBy: { createdAt: 'asc' } } },
          })
        : this.prisma.client.findMany({
            where: { id: { in: [] } },
            include: { references: { orderBy: { createdAt: 'asc' } } },
          }),
    ]);
    const mappedClientIds = this.unique(
      importRecords.map((record) => record.crmClientId).filter((id): id is string => Boolean(id)),
    );
    const mappedClientReferenceIds = this.unique(
      importRecords
        .map((record) => record.crmClientReferenceId)
        .filter((id): id is string => Boolean(id)),
    );
    const [mappedClients, mappedClientReferences] =
      mappedClientIds.length || mappedClientReferenceIds.length
        ? await this.prisma.$transaction([
            mappedClientIds.length
              ? this.prisma.client.findMany({
                  where: { id: { in: mappedClientIds } },
                  select: { id: true },
                })
              : this.prisma.client.findMany({ where: { id: { in: [] } }, select: { id: true } }),
            mappedClientReferenceIds.length
              ? this.prisma.clientReference.findMany({
                  where: { id: { in: mappedClientReferenceIds } },
                  select: { id: true, clientId: true },
                })
              : this.prisma.clientReference.findMany({
                  where: { id: { in: [] } },
                  select: { id: true, clientId: true },
                }),
          ])
        : [[], []];

    return {
      clients: clientMatches,
      importRecords: new Map(
        (importRecords as LegacyImportRecordLookup[]).map((record) => [
          record.legacyClientId,
          record,
        ]),
      ),
      mappedClientReferences: new Map(
        (mappedClientReferences as ClientReferenceIdLookup[]).map((reference) => [
          reference.id,
          reference,
        ]),
      ),
      mappedClients: new Map(
        (mappedClients as ClientIdLookup[]).map((client) => [client.id, client]),
      ),
      plansByDuration: this.groupPlansByDuration(plans),
      references: referenceMatches,
    };
  }

  private resolvePlan(
    durationMonths: number | null,
    plansByDuration: Map<number, Array<{ id: string; name: string; durationMonths: number }>>,
    errors: string[],
  ) {
    if (!durationMonths) {
      return null;
    }

    const matches = plansByDuration.get(durationMonths) ?? [];

    if (matches.length === 0) {
      errors.push('PLAN_NOT_FOUND');
      return null;
    }

    if (matches.length > 1) {
      errors.push('PLAN_AMBIGUOUS');
      return null;
    }

    return matches[0]!;
  }

  private findCandidateMatches(
    normalized: NormalizedLegacyClient,
    lookups: Awaited<ReturnType<LegacyImportService['loadLookups']>>,
  ) {
    const matches: CandidateMatch[] = [];

    for (const reference of lookups.references) {
      if (normalized.rawReference && reference.reference === normalized.rawReference) {
        matches.push({
          clientId: reference.clientId,
          clientName: reference.client.name,
          clientReferenceId: reference.id,
          field: 'reference',
          reference: reference.reference,
        });
      }
    }

    for (const client of lookups.clients) {
      const reference = client.references[0]?.reference ?? client.reference;
      const base = {
        clientId: client.id,
        clientName: client.name,
        clientReferenceId: client.references[0]?.id ?? null,
        reference,
      };

      if (normalized.phoneNormalized && client.phoneNormalized === normalized.phoneNormalized) {
        matches.push({ ...base, field: 'phone' });
      }

      if (normalized.email && client.email?.toLowerCase() === normalized.email) {
        matches.push({ ...base, field: 'email' });
      }

      if (normalized.name && client.name === normalized.name) {
        matches.push({ ...base, field: 'name' });
      }
    }

    return matches;
  }

  private classify(input: {
    candidateMatches: CandidateMatch[];
    errors: string[];
    importRecord: LegacyImportRecordLookup | null;
    normalized: NormalizedLegacyClient;
    payloadHash: string | null;
  }): LegacyImportClassification {
    if (input.errors.some((error) => error.startsWith('INVALID_'))) {
      return 'INVALID';
    }

    if (
      input.errors.some((error) =>
        [
          'DUPLICATE_LEGACY_ID_IN_FILE',
          'DUPLICATE_REFERENCE_IN_FILE',
          'INCOMPLETE_LEGACY_MAPPING',
          'ORPHAN_LEGACY_MAPPING',
          'PLAN_AMBIGUOUS',
          'PLAN_NOT_FOUND',
        ].includes(error),
      )
    ) {
      return 'CONFLICT';
    }

    if (input.normalized.legacyStatus === 'Novo' || input.normalized.legacyStatus === 'Pendente') {
      return 'NEEDS_DECISION';
    }

    if (input.candidateMatches.length && !input.importRecord) {
      return 'POSSIBLE_MATCH';
    }

    if (
      input.importRecord &&
      input.payloadHash &&
      input.importRecord.payloadHash === input.payloadHash
    ) {
      return 'UNCHANGED';
    }

    if (
      input.importRecord &&
      input.payloadHash &&
      input.importRecord.payloadHash !== input.payloadHash
    ) {
      return 'READY_UPDATE';
    }

    return 'READY_CREATE';
  }

  private hashNormalizedPayload(normalized: NormalizedLegacyClient, planId: string | null) {
    return createHash('sha256')
      .update(
        this.stableStringify({
          billingAnchorDay: normalized.billingAnchorDay,
          billingNoticeDays: normalized.billingNoticeDays,
          dueDate: normalized.dueDateText,
          email: normalized.email,
          legacyClientId: normalized.legacyClientId,
          name: normalized.name,
          notes: normalized.notes,
          phoneNormalized: normalized.phoneNormalized,
          planDurationMonths: normalized.planDurationMonths,
          planId,
          recurringValue: normalized.recurringValue,
          reference: normalized.rawReference,
          source,
          status: normalized.status,
        }),
      )
      .digest('hex');
  }

  private summarize(rows: Array<{ classification: LegacyImportClassification }>) {
    return {
      total: rows.length,
      readyCreate: rows.filter((row) => row.classification === 'READY_CREATE').length,
      readyUpdate: rows.filter((row) => row.classification === 'READY_UPDATE').length,
      unchanged: rows.filter((row) => row.classification === 'UNCHANGED').length,
      possibleMatch: rows.filter((row) => row.classification === 'POSSIBLE_MATCH').length,
      needsDecision: rows.filter((row) => row.classification === 'NEEDS_DECISION').length,
      conflict: rows.filter((row) => row.classification === 'CONFLICT').length,
      invalid: rows.filter((row) => row.classification === 'INVALID').length,
    };
  }

  private markDuplicateLegacyIds(
    rows: Array<{
      normalized: ReturnType<LegacyImportService['normalizeClient']>;
      errors: string[];
    }>,
  ) {
    this.markDuplicates(
      rows,
      (row) => row.normalized.value.legacyClientId,
      'DUPLICATE_LEGACY_ID_IN_FILE',
    );
  }

  private markDuplicateReferences(
    rows: Array<{
      normalized: ReturnType<LegacyImportService['normalizeClient']>;
      errors: string[];
    }>,
  ) {
    this.markDuplicates(
      rows,
      (row) => row.normalized.value.rawReference,
      'DUPLICATE_REFERENCE_IN_FILE',
    );
  }

  private markDuplicates<T extends { errors: string[] }>(
    rows: T[],
    getter: (row: T) => string | null,
    code: string,
  ) {
    const counts = new Map<string, number>();

    for (const row of rows) {
      const value = getter(row);
      if (value) {
        counts.set(value, (counts.get(value) ?? 0) + 1);
      }
    }

    for (const row of rows) {
      const value = getter(row);
      if (value && (counts.get(value) ?? 0) > 1) {
        row.errors.push(code);
      }
    }
  }

  private groupPlansByDuration(plans: Array<{ id: string; name: string; durationMonths: number }>) {
    const grouped = new Map<number, Array<{ id: string; name: string; durationMonths: number }>>();

    for (const plan of plans) {
      grouped.set(plan.durationMonths, [...(grouped.get(plan.durationMonths) ?? []), plan]);
    }

    return grouped;
  }

  private hasExistingReferenceWithoutImportRecord(
    candidateMatches: CandidateMatch[],
    importRecord: object | null,
  ) {
    return !importRecord && candidateMatches.some((match) => match.field === 'reference');
  }

  private validateExistingLegacyMapping(
    importRecord: LegacyImportRecordLookup | null,
    lookups: Awaited<ReturnType<LegacyImportService['loadLookups']>>,
    errors: string[],
    warnings: string[],
  ) {
    if (!importRecord) {
      return;
    }

    if (!importRecord.crmClientId || !importRecord.crmClientReferenceId) {
      errors.push('INCOMPLETE_LEGACY_MAPPING');
      warnings.push(orphanLegacyMappingMessage);
      return;
    }

    const client = lookups.mappedClients.get(importRecord.crmClientId);
    const reference = lookups.mappedClientReferences.get(importRecord.crmClientReferenceId);

    if (!client || !reference || reference.clientId !== importRecord.crmClientId) {
      errors.push('ORPHAN_LEGACY_MAPPING');
      warnings.push(orphanLegacyMappingMessage);
    }
  }

  private parseInteger(value: unknown) {
    if (typeof value === 'number' && Number.isInteger(value)) {
      return value;
    }

    if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) {
      return Number(value.trim());
    }

    return null;
  }

  private optionalString(value: unknown) {
    if (typeof value === 'string') {
      return value;
    }

    if (typeof value === 'number' || typeof value === 'bigint') {
      return String(value);
    }

    return null;
  }

  private stableStringify(value: unknown): string {
    if (Array.isArray(value)) {
      return `[${value.map((item) => this.stableStringify(item)).join(',')}]`;
    }

    if (this.isRecord(value)) {
      return `{${Object.keys(value)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${this.stableStringify(value[key])}`)
        .join(',')}}`;
    }

    return JSON.stringify(value);
  }

  private unique<T>(items: T[]) {
    return [...new Set(items)];
  }

  private uniqueCandidateMatches(matches: CandidateMatch[]) {
    const seen = new Set<string>();
    return matches.filter((match) => {
      const key = `${match.field}:${match.clientId}:${match.clientReferenceId ?? ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
