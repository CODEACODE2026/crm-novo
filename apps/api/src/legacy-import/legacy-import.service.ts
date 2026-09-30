import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ClientStatus,
  FinancialPaymentMethod,
  Prisma,
  ReceivableStatus,
  WhatsAppConnectionStatus,
} from '@prisma/client';
import { createHash } from 'node:crypto';
import {
  formatBusinessDate,
  formatSaoPauloBusinessDate,
  getBusinessDateDay,
  parseBusinessDate,
  parseSaoPauloBusinessDate,
} from '../clients/utils/business-date';
import { normalizeBrazilPhone } from '../clients/utils/phone-normalizer';
import { PrismaService } from '../common/prisma/prisma.service';
import { isSchedulerDisabled } from '../config/security';
import { ReceivableCycleService } from '../receivable-cycle/receivable-cycle.service';

const maxClientsPerPreview = 10_000;
const maxPaymentsPerPreview = 10_000;
const maxPaymentsPerImport = 2_000;
const maxCutoverActivateReferences = 500;
const maxUnsignedBigInt = 18_446_744_073_709_551_615n;
const source = 'legacy';
const defaultBillingSendTime = '09:00';
const defaultBillingTimezone = 'America/Sao_Paulo';
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
type LegacyBillingCycle = keyof typeof billingCycleMonths;

const legacyStatusMap = {
  Ativo: 'ATIVO',
  Cancelado: 'CANCELADO',
  Inativo: 'CANCELADO',
} satisfies Record<string, ClientStatus>;

type LegacyImportClassification =
  | 'READY_CREATE'
  | 'READY_UPDATE'
  | 'UNCHANGED'
  | 'POSSIBLE_MATCH'
  | 'SKIPPED_NOT_ACTIVE'
  | 'CONFLICT'
  | 'INVALID';
type LegacyPaymentPreviewClassification =
  | 'READY_PAID_HISTORY'
  | 'UNCHANGED'
  | 'CLIENT_NOT_IMPORTED'
  | 'PENDING_NOT_SUPPORTED'
  | 'UNSUPPORTED'
  | 'CONFLICT'
  | 'INVALID';
type LegacyPaymentImportResult = 'IMPORTED' | 'SKIPPED' | 'FAILED';
type LegacyCutoverActivateResult = 'CREATED' | 'UNCHANGED' | 'SKIPPED' | 'FAILED';
type LegacyCutoverPreviewClassification = 'READY' | 'UNCHANGED' | 'CONFLICT' | 'INVALID';

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
  planCycle: LegacyBillingCycle | null;
  phone: string | null;
  phoneNormalized: string | null;
  planDurationMonths: number | null;
  planName: string | null;
  rawReference: string | null;
  recurringValue: string | null;
  status: ClientStatus | null;
};

type LegacyClientInput = Record<string, unknown>;
type LegacyPaymentInput = Record<string, unknown>;
type LegacyImportRecordLookup = {
  legacyClientId: string;
  payloadHash: string;
  crmClientId: string | null;
  crmClientReferenceId: string | null;
  status?: string;
};
type LegacyFinancialImportRecordLookup = {
  crmClientId: string | null;
  crmClientReferenceId: string | null;
  financialTransactionId: string | null;
  legacyClientId: string;
  legacyPaymentId: string;
  payloadHash: string;
  receivableId: string | null;
  status: string;
};
type ClientIdLookup = { id: string };
type ClientLookup = { id: string; name: string };
type ClientReferenceIdLookup = { id: string; clientId: string; reference?: string };
type FinancialCategoryLookup = { active: boolean; id: string; name: string; type: string };
type FinancialTransactionLookup = {
  clientId: string | null;
  clientReferenceId: string | null;
  id: string;
};
type PlanLookup = {
  active: boolean;
  durationMonths: number;
  defaultValue?: Prisma.Decimal | number | string;
  id: string;
  name: string;
};
type CutoverImportRecord = {
  crmClientId: string | null;
  crmClientReferenceId: string | null;
  legacyClientId: string;
  status: string;
};
type CutoverClient = {
  id: string;
  name: string;
  phoneNormalized: string;
  status: ClientStatus;
};
type CutoverReference = {
  billingAnchorDay: number;
  billingNoticeDays: number;
  clientId: string;
  dueDate: Date;
  id: string;
  planId: string;
  recurringValue: Prisma.Decimal | number | string | null;
  reference: string;
  status: ClientStatus;
};
type CutoverReceivable = {
  amount: Prisma.Decimal | number | string;
  dueDate: Date;
  id: string;
  purpose: string;
  status: ReceivableStatus;
};
type CutoverRow = {
  amount: string | null;
  billingAnchorDay: number | null;
  billingNoticeDays: number | null;
  classification: LegacyCutoverPreviewClassification;
  clientName: string | null;
  clientStatus: ClientStatus | null;
  crmClientId: string | null;
  crmClientReferenceId: string | null;
  dispatchReady: boolean;
  dispatchWarnings: string[];
  dueDate: string | null;
  errors: string[];
  existingReceivable: {
    amount: string;
    dueDate: string;
    id: string;
    purpose: string;
    status: ReceivableStatus;
  } | null;
  legacyClientId: string;
  planId: string | null;
  planName: string | null;
  purpose: 'RENEWAL';
  reference: string | null;
  referenceStatus: ClientStatus | null;
  scheduledForEstimated: string | null;
  warnings: string[];
};
type LegacyImportResultRow = {
  code: string;
  crmClientId?: string;
  crmClientReferenceId?: string;
  legacyClientId: string | null;
  message: string;
  result: 'IMPORTED' | 'SKIPPED' | 'FAILED';
};
type LegacyPaymentImportResultRow = {
  code: string;
  financialTransactionId?: string;
  legacyClientId: string | null;
  legacyPaymentId: string | null;
  message: string;
  result: LegacyPaymentImportResult;
};
type LegacyCutoverActivateRow = {
  code?: string;
  crmClientId: string | null;
  crmClientReferenceId: string | null;
  legacyClientId: string | null;
  message?: string;
  receivableId?: string;
  reference: string | null;
  result: LegacyCutoverActivateResult;
  warnings: string[];
};
type LegacyPaymentPreviewRow = {
  amount: string | null;
  category: { id: string; name: string; type: string } | null;
  classification: LegacyPaymentPreviewClassification;
  crmClientId: string | null;
  crmClientReferenceId: string | null;
  dataCriado: string | null;
  dataPagamento: string | null;
  errors: string[];
  index: number;
  legacyClientId: string | null;
  legacyPaymentId: string | null;
  observation: string | null;
  paymentMethod: FinancialPaymentMethod | null;
  payloadHash: string | null;
  receivableId: null;
  transactionDate: string | null;
  warnings: string[];
};
type NormalizedLegacyPayment = {
  amount: string | null;
  createdAt: string | null;
  legacyClientId: string | null;
  legacyPaymentId: string | null;
  observation: string | null;
  paymentMethod: FinancialPaymentMethod | null;
  rawPaymentMethod: string | null;
  status: string | null;
  transactionDate: string | null;
  transactionType: string | null;
};

class LegacyImportSkip extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

@Injectable()
export class LegacyImportService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(ReceivableCycleService) private readonly receivableCycleService: ReceivableCycleService,
  ) {}

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

    const lookups = await this.loadLookups(normalizedRows, envelope.planMapping);

    const rows = normalizedRows.map((row) => {
      const errors = [...row.normalized.errors, ...row.errors];
      const warnings = [...row.normalized.warnings, ...row.warnings];
      const normalized = row.normalized.value;
      const isImportableLegacyClient = this.isImportableLegacyClient(normalized);
      const planMatch = isImportableLegacyClient
        ? this.resolvePlan(
            normalized.planCycle,
            normalized.planDurationMonths,
            envelope.planMapping,
            lookups.plansById,
            errors,
          )
        : null;
      const importRecord = normalized.legacyClientId
        ? (lookups.importRecords.get(normalized.legacyClientId) ?? null)
        : null;
      const candidateMatches = isImportableLegacyClient
        ? this.findCandidateMatches(normalized, lookups)
        : [];
      this.validateExistingLegacyMapping(importRecord, lookups, errors, warnings);
      if (this.isSkippedLegacyClient(normalized) && importRecord) {
        errors.push('NOT_ACTIVE_EXISTING_MAPPING');
      }
      const payloadHash =
        !isImportableLegacyClient ||
        errors.some((error) => error.startsWith('INVALID_')) ||
        normalized.legacyClientId === null
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

      if (
        candidateMatches.some((match) => match.field === 'name') &&
        !this.hasStrongCandidateMatch(candidateMatches)
      ) {
        warnings.push('WARNING_NAME_MATCH_ONLY');
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

  async importClients(payload: unknown) {
    const preview = await this.previewClients(payload);
    const envelope = this.parseEnvelope(payload);
    const normalizedRows = envelope.clients.map((client) => this.normalizeClient(client).value);
    const rows: LegacyImportResultRow[] = [];

    for (const row of preview.rows) {
      if (row.classification !== 'READY_CREATE') {
        rows.push({
          code: row.classification,
          legacyClientId: row.legacyClientId,
          message: 'Registro nao esta elegivel para importacao nesta etapa.',
          result: 'SKIPPED',
        });
        continue;
      }

      const normalized = normalizedRows[row.index];
      const planId = row.plan?.id;

      if (!normalized || !planId || !row.payloadHash) {
        rows.push({
          code: 'INVALID_IMPORT_ROW',
          legacyClientId: row.legacyClientId,
          message: 'Registro nao possui dados validos para importacao.',
          result: 'SKIPPED',
        });
        continue;
      }

      rows.push(await this.importReadyCreateRow(normalized, planId, row.payloadHash));
    }

    return {
      summary: {
        requested: preview.rows.length,
        imported: rows.filter((row) => row.result === 'IMPORTED').length,
        skipped: rows.filter((row) => row.result === 'SKIPPED').length,
        failed: rows.filter((row) => row.result === 'FAILED').length,
      },
      rows,
    };
  }

  async previewPayments(payload: unknown) {
    return this.buildPaymentPreview(payload, maxPaymentsPerPreview);
  }

  async importPayments(payload: unknown) {
    const preview = await this.buildPaymentPreview(payload, maxPaymentsPerImport);
    const rows: LegacyPaymentImportResultRow[] = [];

    for (const row of preview.rows) {
      if (row.classification === 'READY_PAID_HISTORY') {
        rows.push(await this.importReadyPaidHistoryRow(row));
        continue;
      }

      rows.push({
        code: row.classification,
        legacyClientId: row.legacyClientId,
        legacyPaymentId: row.legacyPaymentId,
        message: 'Pagamento nao elegivel para importacao historica nesta fase.',
        result: 'SKIPPED',
      });
    }

    return {
      summary: {
        requested: rows.length,
        imported: rows.filter((row) => row.result === 'IMPORTED').length,
        skipped: rows.filter((row) => row.result === 'SKIPPED').length,
        failed: rows.filter((row) => row.result === 'FAILED').length,
      },
      rows,
    };
  }

  async previewCutover() {
    const today = parseSaoPauloBusinessDate(new Date());
    const [importRecords, billingSettings, billingTemplates, whatsAppConnection] =
      await this.prisma.$transaction([
        this.prisma.legacyImportRecord.findMany({
          where: { source, status: 'IMPORTED' },
          orderBy: [{ legacyClientId: 'asc' }, { createdAt: 'asc' }],
        }),
        this.prisma.billingAutomationSettings.findUnique({ where: { scope: 'global' } }),
        this.prisma.messageTemplate.findMany({
          where: { type: { in: ['BILLING_DUE', 'BILLING_DUE_GROUPED'] } },
        }),
        this.prisma.whatsAppConnection.findFirst({
          where: {
            status: 'CONNECTED',
            connected: true,
            loggedIn: true,
          },
          orderBy: { createdAt: 'desc' },
        }),
      ]);
    const records = importRecords as CutoverImportRecord[];
    const clientIds = this.unique(
      records.map((record) => record.crmClientId).filter((id): id is string => Boolean(id)),
    );
    const referenceIds = this.unique(
      records
        .map((record) => record.crmClientReferenceId)
        .filter((id): id is string => Boolean(id)),
    );
    const [clients, references, receivables] = await this.prisma.$transaction([
      clientIds.length
        ? this.prisma.client.findMany({
            where: { id: { in: clientIds } },
            select: { id: true, name: true, phoneNormalized: true, status: true },
          })
        : this.prisma.client.findMany({
            where: { id: { in: [] } },
            select: { id: true, name: true, phoneNormalized: true, status: true },
          }),
      referenceIds.length
        ? this.prisma.clientReference.findMany({
            where: { id: { in: referenceIds } },
            select: {
              billingAnchorDay: true,
              billingNoticeDays: true,
              clientId: true,
              dueDate: true,
              id: true,
              planId: true,
              recurringValue: true,
              reference: true,
              status: true,
            },
          })
        : this.prisma.clientReference.findMany({
            where: { id: { in: [] } },
            select: {
              billingAnchorDay: true,
              billingNoticeDays: true,
              clientId: true,
              dueDate: true,
              id: true,
              planId: true,
              recurringValue: true,
              reference: true,
              status: true,
            },
          }),
      referenceIds.length
        ? this.prisma.receivable.findMany({
            where: { clientReferenceId: { in: referenceIds } },
            select: {
              amount: true,
              clientReferenceId: true,
              dueDate: true,
              id: true,
              purpose: true,
              status: true,
            },
            orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
          })
        : this.prisma.receivable.findMany({
            where: { id: { in: [] } },
            select: {
              amount: true,
              clientReferenceId: true,
              dueDate: true,
              id: true,
              purpose: true,
              status: true,
            },
          }),
    ]);
    const planIds = this.unique(
      (references as CutoverReference[]).map((reference) => reference.planId),
    );
    const plans = planIds.length
      ? ((await this.prisma.plan.findMany({ where: { id: { in: planIds } } })) as PlanLookup[])
      : [];
    const clientsById = new Map((clients as CutoverClient[]).map((client) => [client.id, client]));
    const referencesById = new Map(
      (references as CutoverReference[]).map((reference) => [reference.id, reference]),
    );
    const plansById = new Map(plans.map((plan) => [plan.id, plan]));
    const receivablesByReferenceId = new Map<string, CutoverReceivable[]>();
    for (const receivable of receivables as Array<
      CutoverReceivable & { clientReferenceId: string }
    >) {
      const items = receivablesByReferenceId.get(receivable.clientReferenceId) ?? [];
      items.push(receivable);
      receivablesByReferenceId.set(receivable.clientReferenceId, items);
    }
    const duplicateReferenceMappings = this.countBy(
      records
        .map((record) => record.crmClientReferenceId)
        .filter((id): id is string => Boolean(id)),
    );
    const templateReady = billingTemplates.some(
      (template) => template.type === 'BILLING_DUE' && template.active,
    );
    const connectionReady = this.isOperationalWhatsAppConnection(whatsAppConnection);
    const rows = records.map((record) =>
      this.buildCutoverPreviewRow(record, {
        billingSettings,
        client: record.crmClientId ? (clientsById.get(record.crmClientId) ?? null) : null,
        duplicateReferenceCount: record.crmClientReferenceId
          ? (duplicateReferenceMappings.get(record.crmClientReferenceId) ?? 0)
          : 0,
        plan: record.crmClientReferenceId
          ? (plansById.get(referencesById.get(record.crmClientReferenceId)?.planId ?? '') ?? null)
          : null,
        receivables: record.crmClientReferenceId
          ? (receivablesByReferenceId.get(record.crmClientReferenceId) ?? [])
          : [],
        reference: record.crmClientReferenceId
          ? (referencesById.get(record.crmClientReferenceId) ?? null)
          : null,
        templateReady,
        today,
        whatsAppReady: connectionReady,
      }),
    );

    return {
      mode: 'READ_ONLY',
      unit: 'CLIENT_REFERENCE',
      purpose: 'RENEWAL',
      summary: this.summarizeCutover(rows),
      metadata: {
        unique: ['clientReferenceId', 'purpose', 'dueDate'],
        billingSchedulerControlledBy: 'BILLING_SCHEDULER_ENABLED',
        billingSchedulerStatus: this.isSchedulerDisabled('BILLING_SCHEDULER_ENABLED')
          ? 'DISABLED'
          : 'ENABLED',
        recoverySchedulerControlledBy: 'RECOVERY_SCHEDULER_ENABLED',
        recoverySchedulerStatus: this.isSchedulerDisabled('RECOVERY_SCHEDULER_ENABLED')
          ? 'DISABLED'
          : 'ENABLED',
        safety:
          'Este preview nao cria cobrancas. Durante o cutover, mantenha Billing e Recovery desabilitados ate a conferencia final.',
      },
      rows,
    };
  }

  async activateCutover(payload: unknown = {}) {
    this.assertCutoverSchedulersDisabled();
    const selection = this.parseCutoverActivationPayload(payload);
    const preview = await this.previewCutover();
    const rowsByReferenceId = new Map(
      preview.rows
        .filter((row) => row.crmClientReferenceId)
        .map((row) => [row.crmClientReferenceId as string, row]),
    );

    if (selection.clientReferenceIds.length > maxCutoverActivateReferences) {
      throw new BadRequestException({
        code: 'CUTOVER_BATCH_LIMIT_EXCEEDED',
        message: `Ative no maximo ${maxCutoverActivateReferences} referencias por request.`,
      });
    }

    const rows: LegacyCutoverActivateRow[] = [];

    for (const clientReferenceId of selection.clientReferenceIds) {
      const row = rowsByReferenceId.get(clientReferenceId);

      if (!row) {
        rows.push({
          legacyClientId: null,
          crmClientId: null,
          crmClientReferenceId: clientReferenceId,
          reference: null,
          result: 'SKIPPED',
          code: 'NOT_FOUND',
          message: 'Referencia nao pertence ao preview legado atual.',
          warnings: [],
        });
        continue;
      }

      if (row.classification === 'UNCHANGED' && row.existingReceivable) {
        rows.push({
          legacyClientId: row.legacyClientId,
          crmClientId: row.crmClientId,
          crmClientReferenceId: row.crmClientReferenceId,
          reference: row.reference,
          result: 'UNCHANGED',
          receivableId: row.existingReceivable.id,
          code: 'UNCHANGED',
          message: 'Conta a receber do ciclo atual ja existe.',
          warnings: row.warnings,
        });
        continue;
      }

      if (row.classification !== 'READY' || !row.crmClientReferenceId) {
        rows.push({
          legacyClientId: row.legacyClientId,
          crmClientId: row.crmClientId,
          crmClientReferenceId: row.crmClientReferenceId,
          reference: row.reference,
          result: 'SKIPPED',
          code: row.errors[0] ?? row.classification,
          message: 'Referencia nao esta READY no estado atual.',
          warnings: row.warnings,
        });
        continue;
      }

      try {
        const result = await this.receivableCycleService.ensureCurrentCycleReceivable(
          row.crmClientReferenceId,
          {
            currentDate: new Date(),
            expectedClientId: row.crmClientId,
            rejectPastDue: true,
            requireClientActive: true,
            requirePlanActive: true,
          },
        );
        rows.push({
          legacyClientId: row.legacyClientId,
          crmClientId: row.crmClientId,
          crmClientReferenceId: row.crmClientReferenceId,
          reference: row.reference,
          result: result.action === 'created' ? 'CREATED' : 'UNCHANGED',
          receivableId: result.receivable.id,
          code: result.action === 'created' ? 'CREATED' : 'UNCHANGED',
          message:
            result.action === 'created'
              ? 'Conta a receber do proximo ciclo criada.'
              : 'Conta a receber do ciclo atual ja existe.',
          warnings: row.warnings,
        });
      } catch (error) {
        if (this.isCutoverBusinessError(error)) {
          rows.push({
            legacyClientId: row.legacyClientId,
            crmClientId: row.crmClientId,
            crmClientReferenceId: row.crmClientReferenceId,
            reference: row.reference,
            result: 'SKIPPED',
            code: this.cutoverBusinessErrorCode(error),
            message: this.cutoverBusinessErrorMessage(error),
            warnings: row.warnings,
          });
          continue;
        }

        throw error;
      }
    }

    return {
      mode: 'CONTROLLED_ACTIVATION',
      unit: 'CLIENT_REFERENCE',
      purpose: 'RENEWAL',
      summary: {
        requested: selection.clientReferenceIds.length,
        created: rows.filter((row) => row.result === 'CREATED').length,
        unchanged: rows.filter((row) => row.result === 'UNCHANGED').length,
        skipped: rows.filter((row) => row.result === 'SKIPPED').length,
        failed: rows.filter((row) => row.result === 'FAILED').length,
        warnings: rows.filter((row) => row.warnings.length > 0).length,
      },
      rows,
    };
  }

  private async buildPaymentPreview(payload: unknown, maxPayments: number) {
    const envelope = this.parsePaymentsEnvelope(payload, maxPayments);
    const normalizedRows = envelope.payments.map((payment, index) => ({
      errors: [] as string[],
      index,
      input: payment,
      normalized: this.normalizePayment(payment),
      warnings: [] as string[],
    }));

    this.markDuplicateLegacyPaymentIds(normalizedRows);

    const lookups = await this.loadPaymentLookups(normalizedRows);

    const rows = normalizedRows.map((row) => {
      const errors = [...row.normalized.errors, ...row.errors];
      const warnings = [...row.normalized.warnings, ...row.warnings];
      const normalized = row.normalized.value;
      const legacyClientMapping = normalized.legacyClientId
        ? (lookups.importRecords.get(normalized.legacyClientId) ?? null)
        : null;
      const category = lookups.category ?? null;
      const existingFinancialRecord = normalized.legacyPaymentId
        ? (lookups.financialImportRecords.get(normalized.legacyPaymentId) ?? null)
        : null;

      this.validateHistoricalCategory(lookups.categories, errors, category);
      this.validateLegacyClientMapping(legacyClientMapping, lookups, errors, warnings);
      this.validateExistingFinancialMapping(existingFinancialRecord, lookups, errors, warnings);

      const crmClientId =
        legacyClientMapping?.crmClientId ?? existingFinancialRecord?.crmClientId ?? null;
      const crmClientReferenceId =
        legacyClientMapping?.crmClientReferenceId ??
        existingFinancialRecord?.crmClientReferenceId ??
        null;
      const client = crmClientId ? (lookups.mappedClients.get(crmClientId) ?? null) : null;
      const reference = crmClientReferenceId
        ? (lookups.mappedClientReferences.get(crmClientReferenceId) ?? null)
        : null;
      const payloadHash =
        this.paymentHashable(normalized, category, crmClientId, crmClientReferenceId) &&
        !errors.some((error) => error.startsWith('INVALID_'))
          ? this.hashNormalizedPaymentPayload(normalized, {
              categoryId: category?.id ?? '',
              crmClientId,
              crmClientReferenceId,
            })
          : null;
      const classification = this.classifyPayment({
        errors,
        existingFinancialRecord,
        legacyClientMapping,
        normalized,
        payloadHash,
      });

      return {
        index: row.index,
        legacyPaymentId: normalized.legacyPaymentId,
        legacyClientId: normalized.legacyClientId,
        crmClientId,
        crmClientReferenceId,
        clientName: client?.name ?? null,
        reference: reference?.reference ?? null,
        legacyStatus: normalized.status,
        transactionType: normalized.transactionType,
        dataCriado: normalized.createdAt,
        dataPagamento: normalized.transactionDate,
        amount: normalized.amount,
        transactionDate: normalized.transactionDate,
        paymentMethod: normalized.paymentMethod,
        observation: normalized.observation,
        category: category ? { id: category.id, name: category.name, type: category.type } : null,
        receivableId: null,
        classification,
        errors: this.unique(errors),
        warnings: this.unique(warnings),
        payloadHash,
      };
    });

    return {
      summary: this.summarizePayments(rows),
      hashFields: [
        'source',
        'legacyPaymentId',
        'legacyClientId',
        'status',
        'amount',
        'transactionDate',
        'paymentMethod',
        'transactionType',
        'observation',
        'crmClientId',
        'crmClientReferenceId',
        'categoryId',
        'origin',
      ],
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
      planMapping: this.parsePlanMapping(payload.planMapping),
    };
  }

  private parsePaymentsEnvelope(payload: unknown, maxPayments: number) {
    if (!this.isRecord(payload)) {
      throw new BadRequestException('INVALID_JSON_ENVELOPE');
    }

    if (payload.schemaVersion !== 1) {
      throw new BadRequestException('UNSUPPORTED_SCHEMA_VERSION');
    }

    if (payload.source !== source) {
      throw new BadRequestException('INVALID_SOURCE');
    }

    if (!Array.isArray(payload.payments)) {
      throw new BadRequestException('INVALID_PAYMENTS_ARRAY');
    }

    if (payload.payments.length > maxPayments) {
      throw new BadRequestException('PAYMENTS_LIMIT_EXCEEDED');
    }

    return {
      payments: payload.payments.map((payment) => {
        if (!this.isRecord(payment)) {
          return {};
        }

        return payment;
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
    const recurringValue = this.normalizeRecurringValue(
      input.value_mensalidade,
      status,
      errors,
      warnings,
    );
    const planCycle = this.normalizeBillingCycle(input.type_cobranca, errors);
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
      planCycle: planCycle?.cycle ?? null,
      phone,
      phoneNormalized,
      planDurationMonths: planCycle?.durationMonths ?? null,
      planName: this.optionalString(input.type_cobranca)?.trim() || null,
      rawReference: reference,
      recurringValue,
      status,
    };

    return { errors, value, warnings };
  }

  private normalizePayment(input: LegacyPaymentInput) {
    const errors: string[] = [];
    const warnings: string[] = [];
    const legacyPaymentId = this.normalizeLegacyPaymentId(input.id, errors);
    const legacyClientId = this.normalizeLegacyClientId(input.client_id, errors);
    const status = this.optionalString(input.status)?.trim().toUpperCase() || null;
    const transactionType = this.optionalString(input.tipo_transacao)?.trim().toUpperCase() || null;
    const rawPaymentMethod = this.optionalString(input.tipo_pagamento)?.trim() || null;
    const paymentMethod = this.normalizeHistoricalPaymentMethod(rawPaymentMethod, errors);
    const amount = this.normalizePaymentAmount(input.valor_debito, errors);
    const transactionDate = this.normalizePaymentDate(input.data_pagamento, errors, status);
    const createdAt = this.optionalString(input.data_criado)?.trim() || null;
    const observation = this.normalizeObservation(input.observation);

    if (!status) {
      errors.push('INVALID_STATUS');
    }

    if (!transactionType) {
      errors.push('INVALID_TRANSACTION_TYPE');
    }

    const value: NormalizedLegacyPayment = {
      amount,
      createdAt,
      legacyClientId,
      legacyPaymentId,
      observation,
      paymentMethod,
      rawPaymentMethod,
      status,
      transactionDate,
      transactionType,
    };

    if (createdAt && !this.isDateLike(createdAt)) {
      warnings.push('INVALID_DATA_CRIADO');
    }

    return { errors, value, warnings };
  }

  private buildCutoverPreviewRow(
    record: CutoverImportRecord,
    context: {
      billingSettings: { sendTime: string; timezone: string } | null;
      client: CutoverClient | null;
      duplicateReferenceCount: number;
      plan: PlanLookup | null;
      receivables: CutoverReceivable[];
      reference: CutoverReference | null;
      templateReady: boolean;
      today: Date;
      whatsAppReady: boolean;
    },
  ): CutoverRow {
    const errors: string[] = [];
    const warnings: string[] = [];
    const dispatchWarnings: string[] = [];
    const { client, plan, reference } = context;

    if (!record.crmClientId || !record.crmClientReferenceId) {
      errors.push('ORPHAN_LEGACY_MAPPING');
    }

    if (!client) {
      errors.push('CLIENT_NOT_FOUND');
    }

    if (!reference) {
      errors.push('CLIENT_REFERENCE_NOT_FOUND');
    }

    if (client && reference && reference.clientId !== record.crmClientId) {
      errors.push('CLIENT_REFERENCE_MAPPING_MISMATCH');
    }

    if (context.duplicateReferenceCount > 1) {
      errors.push('DUPLICATE_LEGACY_MAPPING');
    }

    if (client && client.status !== 'ATIVO') {
      errors.push('CLIENT_NOT_ACTIVE');
    }

    if (reference && reference.status !== 'ATIVO') {
      errors.push('REFERENCE_NOT_ACTIVE');
    }

    if (reference && !plan) {
      errors.push('PLAN_NOT_FOUND');
    }

    if (plan && !plan.active) {
      errors.push('PLAN_INACTIVE');
    }

    const amount = reference ? Number(reference.recurringValue) : 0;
    if (reference && (!Number.isFinite(amount) || amount <= 0)) {
      errors.push('INVALID_RECURRING_VALUE');
    }

    if (
      reference &&
      (!Number.isInteger(reference.billingAnchorDay) ||
        reference.billingAnchorDay < 1 ||
        reference.billingAnchorDay > 31)
    ) {
      errors.push('INVALID_BILLING_ANCHOR_DAY');
    }

    if (
      reference &&
      Number.isInteger(reference.billingAnchorDay) &&
      reference.billingAnchorDay !== getBusinessDateDay(reference.dueDate)
    ) {
      warnings.push('WARNING_BILLING_ANCHOR_DAY_DIVERGENT');
    }

    if (
      reference &&
      (!Number.isInteger(reference.billingNoticeDays) || reference.billingNoticeDays < 0)
    ) {
      errors.push('INVALID_BILLING_NOTICE_DAYS');
    }

    const dueDate = reference ? formatBusinessDate(reference.dueDate) : null;
    const today = formatBusinessDate(context.today);

    if (dueDate && dueDate < today) {
      errors.push('CONFLICT_PAST_DUE_DATE');
    }

    if (dueDate && dueDate === today) {
      warnings.push('WARNING_DUE_TODAY');
    }

    const sameCycleReceivables = reference
      ? context.receivables.filter(
          (receivable) =>
            receivable.purpose === 'RENEWAL' && formatBusinessDate(receivable.dueDate) === dueDate,
        )
      : [];
    const sameCyclePending =
      sameCycleReceivables.find((receivable) => receivable.status === 'PENDENTE') ?? null;
    const sameCyclePendingCompatible =
      sameCyclePending &&
      reference &&
      this.sameDecimal(sameCyclePending.amount, reference.recurringValue)
        ? sameCyclePending
        : null;
    const sameCyclePaid =
      sameCycleReceivables.find((receivable) => receivable.status === 'PAGO') ?? null;
    const sameCycleCanceled =
      sameCycleReceivables.find((receivable) => receivable.status === 'CANCELADO') ?? null;
    const sameDateWrongPurposeReceivable =
      context.receivables.find(
        (receivable) =>
          receivable.purpose !== 'RENEWAL' && formatBusinessDate(receivable.dueDate) === dueDate,
      ) ?? null;
    const divergentReceivable =
      context.receivables.find(
        (receivable) =>
          (receivable.purpose === 'RENEWAL' &&
            formatBusinessDate(receivable.dueDate) !== dueDate) ||
          receivable === sameDateWrongPurposeReceivable,
      ) ?? null;

    if (sameCycleReceivables.length > 1) {
      errors.push('RECEIVABLE_DUPLICATE');
    }

    if (sameCyclePending && !sameCyclePendingCompatible) {
      errors.push('RECEIVABLE_DIVERGENT');
    }

    if (sameCyclePaid) {
      errors.push('RECEIVABLE_ALREADY_PAID');
    }

    if (sameCycleCanceled) {
      errors.push('RECEIVABLE_CANCELED');
    }

    if (divergentReceivable) {
      errors.push('RECEIVABLE_DIVERGENT');
    }

    let scheduledForEstimated: string | null = null;
    if (
      reference &&
      Number.isInteger(reference.billingNoticeDays) &&
      reference.billingNoticeDays >= 0
    ) {
      scheduledForEstimated = this.calculateCutoverScheduledFor(
        reference.dueDate,
        reference.billingNoticeDays,
        context.billingSettings,
      ).toISOString();

      if (scheduledForEstimated < new Date().toISOString() && dueDate && dueDate > today) {
        warnings.push('WARNING_BILLING_NOTICE_DATE_PASSED');
      } else if (formatSaoPauloBusinessDate(new Date(scheduledForEstimated)) === today) {
        warnings.push('WARNING_BILLING_NOTICE_DATE_TODAY');
      }
    }

    if (!client?.phoneNormalized || !this.isValidPhone(client.phoneNormalized)) {
      dispatchWarnings.push('WARNING_INVALID_PHONE_FOR_DISPATCH');
    }

    if (!context.whatsAppReady) {
      dispatchWarnings.push('WARNING_WHATSAPP_NOT_READY');
    }

    if (!context.templateReady) {
      dispatchWarnings.push('WARNING_BILLING_TEMPLATE_NOT_READY');
    }

    warnings.push(...dispatchWarnings);

    const existingReceivable =
      sameCyclePending ?? sameCyclePaid ?? sameCycleCanceled ?? divergentReceivable;
    const uniqueErrors = this.unique(errors);
    const uniqueWarnings = this.unique(warnings);
    const classification = this.classifyCutoverRow(uniqueErrors, sameCyclePendingCompatible);

    return {
      amount: reference ? this.decimalToFixed(reference.recurringValue) : null,
      billingAnchorDay: reference?.billingAnchorDay ?? null,
      billingNoticeDays: reference?.billingNoticeDays ?? null,
      classification,
      clientName: client?.name ?? null,
      clientStatus: client?.status ?? null,
      crmClientId: record.crmClientId,
      crmClientReferenceId: record.crmClientReferenceId,
      dispatchReady: dispatchWarnings.length === 0,
      dispatchWarnings: this.unique(dispatchWarnings),
      dueDate,
      errors: uniqueErrors,
      existingReceivable: existingReceivable
        ? {
            amount: this.decimalToFixed(existingReceivable.amount),
            dueDate: formatBusinessDate(existingReceivable.dueDate),
            id: existingReceivable.id,
            purpose: existingReceivable.purpose,
            status: existingReceivable.status,
          }
        : null,
      legacyClientId: record.legacyClientId,
      planId: reference?.planId ?? null,
      planName: plan?.name ?? null,
      purpose: 'RENEWAL',
      reference: reference?.reference ?? null,
      referenceStatus: reference?.status ?? null,
      scheduledForEstimated,
      warnings: uniqueWarnings,
    };
  }

  private classifyCutoverRow(errors: string[], sameCyclePending: CutoverReceivable | null) {
    if (errors.some((error) => error.startsWith('INVALID_'))) {
      return 'INVALID' as const;
    }

    if (errors.length) {
      return 'CONFLICT' as const;
    }

    if (sameCyclePending) {
      return 'UNCHANGED' as const;
    }

    return 'READY' as const;
  }

  private summarizeCutover(rows: CutoverRow[]) {
    const warnings = rows.filter((row) => row.warnings.length > 0).length;

    return {
      total: rows.length,
      ready: rows.filter((row) => row.classification === 'READY').length,
      unchanged: rows.filter((row) => row.classification === 'UNCHANGED').length,
      conflict: rows.filter((row) => row.classification === 'CONFLICT').length,
      invalid: rows.filter((row) => row.classification === 'INVALID').length,
      warnings,
      noticeDatePassed: rows.filter((row) =>
        row.warnings.includes('WARNING_BILLING_NOTICE_DATE_PASSED'),
      ).length,
      dueToday: rows.filter((row) => row.warnings.includes('WARNING_DUE_TODAY')).length,
      dispatchNotReady: rows.filter((row) => !row.dispatchReady).length,
    };
  }

  private parseCutoverActivationPayload(payload: unknown) {
    if (payload === undefined || payload === null) {
      return { clientReferenceIds: [] };
    }

    if (typeof payload !== 'object' || Array.isArray(payload)) {
      throw new BadRequestException('Payload de ativacao do cutover invalido.');
    }

    const input = payload as Record<string, unknown>;
    const allowedKeys = new Set(['clientReferenceIds']);
    const unsupportedKeys = Object.keys(input).filter(
      (key) => !allowedKeys.has(key) && input[key] !== undefined,
    );

    if (unsupportedKeys.length) {
      throw new BadRequestException('Payload de ativacao aceita somente clientReferenceIds.');
    }

    const clientReferenceIds =
      this.parseOptionalStringArray(input.clientReferenceIds, 'clientReferenceIds') ?? [];

    if (clientReferenceIds.length > maxCutoverActivateReferences) {
      throw new BadRequestException({
        code: 'CUTOVER_BATCH_LIMIT_EXCEEDED',
        message: `Ative no maximo ${maxCutoverActivateReferences} referencias por request.`,
      });
    }

    return { clientReferenceIds };
  }

  private parseOptionalStringArray(value: unknown, field: string) {
    if (value === undefined) {
      return null;
    }

    if (!Array.isArray(value)) {
      throw new BadRequestException(`${field} deve conter apenas strings nao vazias.`);
    }

    const items: unknown[] = value;

    if (items.some((item) => typeof item !== 'string' || !item.trim())) {
      throw new BadRequestException(`${field} deve conter apenas strings nao vazias.`);
    }

    return this.unique(items.map((item) => (item as string).trim()));
  }

  private assertCutoverSchedulersDisabled() {
    if (
      this.isSchedulerDisabled('BILLING_SCHEDULER_ENABLED') &&
      this.isSchedulerDisabled('RECOVERY_SCHEDULER_ENABLED')
    ) {
      return;
    }

    throw new BadRequestException({
      code: 'SCHEDULERS_MUST_BE_DISABLED',
      message:
        'BILLING_SCHEDULER_ENABLED e RECOVERY_SCHEDULER_ENABLED devem estar exatamente como false antes da ativacao.',
      billingSchedulerStatus: this.isSchedulerDisabled('BILLING_SCHEDULER_ENABLED')
        ? 'DISABLED'
        : 'ENABLED',
      recoverySchedulerStatus: this.isSchedulerDisabled('RECOVERY_SCHEDULER_ENABLED')
        ? 'DISABLED'
        : 'ENABLED',
    });
  }

  private isSchedulerDisabled(key: 'BILLING_SCHEDULER_ENABLED' | 'RECOVERY_SCHEDULER_ENABLED') {
    return isSchedulerDisabled(this.config.get<string>(key));
  }

  private isCutoverBusinessError(error: unknown): error is ConflictException | NotFoundException {
    return error instanceof ConflictException || error instanceof NotFoundException;
  }

  private cutoverBusinessErrorCode(error: ConflictException | NotFoundException) {
    const response = error.getResponse();

    if (typeof response === 'object' && response && 'code' in response) {
      const code = (response as { code?: unknown }).code;
      if (typeof code === 'string' && code.trim()) return code;
    }

    return error instanceof NotFoundException ? 'NOT_FOUND' : 'CONFLICT';
  }

  private cutoverBusinessErrorMessage(error: ConflictException | NotFoundException) {
    const response = error.getResponse();

    if (typeof response === 'object' && response && 'message' in response) {
      const message = (response as { message?: unknown }).message;
      if (typeof message === 'string' && message.trim()) return message;
    }

    return error.message;
  }

  private calculateCutoverScheduledFor(
    dueDate: Date,
    billingNoticeDays: number,
    settings: { sendTime: string; timezone: string } | null,
  ) {
    const [yearPart, monthPart, dayPart] = formatBusinessDate(dueDate).split('-');
    const year = Number(yearPart);
    const month = Number(monthPart);
    const day = Number(dayPart);
    const scheduledDate = new Date(Date.UTC(year, month - 1, day - billingNoticeDays));
    const yyyyMmDd = formatBusinessDate(scheduledDate);
    const sendTime = settings?.sendTime ?? defaultBillingSendTime;
    const timezone = settings?.timezone ?? defaultBillingTimezone;

    if (timezone !== defaultBillingTimezone) {
      throw new BadRequestException('Timezone de cobranca invalido.');
    }

    return new Date(`${yyyyMmDd}T${sendTime}:00-03:00`);
  }

  private decimalToFixed(value: Prisma.Decimal | number | string | null) {
    if (value === null) return '0.00';
    if (value instanceof Prisma.Decimal) return value.toFixed(2);
    return Number(value).toFixed(2);
  }

  private sameDecimal(
    left: Prisma.Decimal | number | string | null,
    right: Prisma.Decimal | number | string | null,
  ) {
    return this.decimalToFixed(left) === this.decimalToFixed(right);
  }

  private isOperationalWhatsAppConnection(
    connection: {
      connected: boolean;
      loggedIn: boolean;
      status: WhatsAppConnectionStatus;
    } | null,
  ) {
    return Boolean(
      connection &&
      connection.status === 'CONNECTED' &&
      connection.connected &&
      connection.loggedIn,
    );
  }

  private isValidPhone(phone: string) {
    try {
      normalizeBrazilPhone(phone);
      return true;
    } catch {
      return false;
    }
  }

  private countBy(values: string[]) {
    const counts = new Map<string, number>();
    for (const value of values) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    return counts;
  }

  private normalizeLegacyPaymentId(value: unknown, errors: string[]) {
    const id = this.normalizeUnsignedBigIntId(value);

    if (!id) {
      errors.push('INVALID_LEGACY_PAYMENT_ID');
    }

    return id;
  }

  private normalizeLegacyClientId(value: unknown, errors: string[]) {
    const id = this.normalizeUnsignedBigIntId(value);

    if (!id) {
      errors.push('INVALID_LEGACY_ID');
    }

    return id;
  }

  private normalizeUnsignedBigIntId(value: unknown) {
    if (typeof value === 'number') {
      if (!Number.isSafeInteger(value) || value <= 0) {
        return null;
      }

      return String(value);
    }

    if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
      const parsed = BigInt(value.trim());

      if (parsed <= 0n || parsed > maxUnsignedBigInt) {
        return null;
      }

      return parsed.toString();
    }

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

  private normalizeRecurringValue(
    value: unknown,
    status: ClientStatus | null,
    errors: string[],
    warnings: string[],
  ) {
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

    if (cents > 999_999_999_999n) {
      errors.push('INVALID_RECURRING_VALUE');
      return null;
    }

    if (cents === 0n) {
      if (status === 'CANCELADO') {
        warnings.push('WARNING_ZERO_RECURRING_VALUE_HISTORICAL');
      } else {
        errors.push('INVALID_RECURRING_VALUE');
      }
    }

    return `${whole}.${decimal.padEnd(2, '0')}`;
  }

  private normalizePaymentAmount(value: unknown, errors: string[]) {
    const text =
      typeof value === 'number'
        ? value.toFixed(2)
        : typeof value === 'string'
          ? value.trim().replace(',', '.')
          : null;

    if (!text || !/^\d+(\.\d{1,2})?$/.test(text)) {
      errors.push('INVALID_AMOUNT');
      return null;
    }

    const [whole = '0', decimal = ''] = text.split('.');
    const cents = BigInt(whole) * 100n + BigInt(decimal.padEnd(2, '0'));

    if (cents <= 0n || cents > 999_999_999_999n) {
      errors.push('INVALID_AMOUNT');
      return null;
    }

    return `${whole}.${decimal.padEnd(2, '0')}`;
  }

  private normalizePaymentDate(value: unknown, errors: string[], status: string | null) {
    const text = this.optionalString(value)?.trim();

    if (!text) {
      if (status === 'PAGO') {
        errors.push('INVALID_PAYMENT_DATE');
      }

      return null;
    }

    try {
      return formatBusinessDate(parseBusinessDate(text));
    } catch {
      errors.push('INVALID_PAYMENT_DATE');
      return null;
    }
  }

  private normalizeHistoricalPaymentMethod(value: string | null, errors: string[]) {
    const method = value
      ?.normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toUpperCase();

    if (!method) {
      errors.push('INVALID_PAYMENT_METHOD');
      return null;
    }

    if (['PIX', 'BOLETO', 'CARTAO', 'TRANSFERENCIA'].includes(method)) {
      return method as FinancialPaymentMethod;
    }

    errors.push('INVALID_PAYMENT_METHOD');
    return null;
  }

  private normalizeObservation(value: unknown) {
    const text = this.optionalString(value)?.trim();
    return text || null;
  }

  private isDateLike(value: string) {
    try {
      parseBusinessDate(value.slice(0, 10));
      return true;
    } catch {
      return false;
    }
  }

  private normalizeBillingCycle(value: unknown, errors: string[]) {
    const cycle = this.optionalString(value)?.trim().toUpperCase();

    if (!cycle || !(cycle in billingCycleMonths)) {
      errors.push('INVALID_PLAN');
      return null;
    }

    return {
      cycle: cycle as LegacyBillingCycle,
      durationMonths: billingCycleMonths[cycle as LegacyBillingCycle],
    };
  }

  private parsePlanMapping(value: unknown) {
    const mapping: Partial<Record<LegacyBillingCycle, string>> = {};

    if (value === undefined) {
      return mapping;
    }

    if (!this.isRecord(value)) {
      throw new BadRequestException('INVALID_PLAN_MAPPING');
    }

    const validCycles = new Set(Object.keys(billingCycleMonths));
    if (Object.keys(value).some((key) => !validCycles.has(key))) {
      throw new BadRequestException('INVALID_PLAN_MAPPING');
    }

    for (const cycle of Object.keys(billingCycleMonths) as LegacyBillingCycle[]) {
      const planId = value[cycle];
      if (planId === undefined || planId === null || planId === '') {
        continue;
      }

      if (typeof planId !== 'string' || !planId.trim()) {
        throw new BadRequestException('INVALID_PLAN_MAPPING');
      }

      mapping[cycle] = planId.trim();
    }

    return mapping;
  }

  private async loadLookups(
    rows: Array<{ normalized: ReturnType<LegacyImportService['normalizeClient']> }>,
    planMapping: Partial<Record<LegacyBillingCycle, string>>,
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

    const mappedPlanIds = this.unique(Object.values(planMapping).filter(Boolean));

    const [plans, importRecords, referenceMatches, clientMatches] = await this.prisma.$transaction([
      this.prisma.plan.findMany({
        where: mappedPlanIds.length
          ? { OR: [{ active: true }, { id: { in: mappedPlanIds } }] }
          : { active: true },
      }),
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
      plansById: new Map((plans as PlanLookup[]).map((plan) => [plan.id, plan])),
      references: referenceMatches,
    };
  }

  private async loadPaymentLookups(
    rows: Array<{ normalized: ReturnType<LegacyImportService['normalizePayment']> }>,
  ) {
    const legacyClientIds = this.unique(
      rows
        .map((row) => row.normalized.value.legacyClientId)
        .filter((id): id is string => Boolean(id)),
    );
    const legacyPaymentIds = this.unique(
      rows
        .map((row) => row.normalized.value.legacyPaymentId)
        .filter((id): id is string => Boolean(id)),
    );

    const [categories, importRecords, financialImportRecords] = await this.prisma.$transaction([
      this.prisma.financialCategory.findMany({
        where: {
          name: { equals: 'Receita histórica', mode: 'insensitive' },
          type: 'ENTRADA',
        },
      }),
      legacyClientIds.length
        ? this.prisma.legacyImportRecord.findMany({
            where: { legacyClientId: { in: legacyClientIds }, source },
          })
        : this.prisma.legacyImportRecord.findMany({ where: { id: { in: [] } } }),
      legacyPaymentIds.length
        ? this.prisma.legacyFinancialImportRecord.findMany({
            where: { legacyPaymentId: { in: legacyPaymentIds }, source },
          })
        : this.prisma.legacyFinancialImportRecord.findMany({ where: { id: { in: [] } } }),
    ]);
    const mappedClientIds = this.unique(
      [
        ...importRecords.map((record) => record.crmClientId),
        ...financialImportRecords.map((record) => record.crmClientId),
      ].filter((id): id is string => Boolean(id)),
    );
    const mappedClientReferenceIds = this.unique(
      [
        ...importRecords.map((record) => record.crmClientReferenceId),
        ...financialImportRecords.map((record) => record.crmClientReferenceId),
      ].filter((id): id is string => Boolean(id)),
    );
    const financialTransactionIds = this.unique(
      financialImportRecords
        .map((record) => record.financialTransactionId)
        .filter((id): id is string => Boolean(id)),
    );
    const [mappedClients, mappedClientReferences, financialTransactions] =
      mappedClientIds.length || mappedClientReferenceIds.length || financialTransactionIds.length
        ? await this.prisma.$transaction([
            mappedClientIds.length
              ? this.prisma.client.findMany({
                  where: { id: { in: mappedClientIds } },
                  select: { id: true, name: true },
                })
              : this.prisma.client.findMany({
                  where: { id: { in: [] } },
                  select: { id: true, name: true },
                }),
            mappedClientReferenceIds.length
              ? this.prisma.clientReference.findMany({
                  where: { id: { in: mappedClientReferenceIds } },
                  select: { clientId: true, id: true, reference: true },
                })
              : this.prisma.clientReference.findMany({
                  where: { id: { in: [] } },
                  select: { clientId: true, id: true, reference: true },
                }),
            financialTransactionIds.length
              ? this.prisma.financialTransaction.findMany({
                  where: { id: { in: financialTransactionIds } },
                  select: { clientId: true, clientReferenceId: true, id: true },
                })
              : this.prisma.financialTransaction.findMany({
                  where: { id: { in: [] } },
                  select: { clientId: true, clientReferenceId: true, id: true },
                }),
          ])
        : [[], [], []];
    const activeCategories = (categories as FinancialCategoryLookup[]).filter(
      (category) => category.active,
    );

    return {
      categories: categories as FinancialCategoryLookup[],
      category: activeCategories.length === 1 ? activeCategories[0]! : null,
      financialImportRecords: new Map(
        (financialImportRecords as LegacyFinancialImportRecordLookup[]).map((record) => [
          record.legacyPaymentId,
          record,
        ]),
      ),
      financialTransactions: new Map(
        (financialTransactions as FinancialTransactionLookup[]).map((transaction) => [
          transaction.id,
          transaction,
        ]),
      ),
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
        (mappedClients as ClientLookup[]).map((client) => [client.id, client]),
      ),
    };
  }

  private resolvePlan(
    cycle: LegacyBillingCycle | null,
    durationMonths: number | null,
    planMapping: Partial<Record<LegacyBillingCycle, string>>,
    plansById: Map<string, PlanLookup>,
    errors: string[],
  ) {
    if (!cycle || !durationMonths) {
      return null;
    }

    const mappedPlanId = planMapping[cycle];

    if (!mappedPlanId) {
      errors.push('PLAN_NOT_MAPPED');
      return null;
    }

    const plan = plansById.get(mappedPlanId);

    if (!plan || !plan.active || plan.durationMonths !== durationMonths) {
      errors.push('INVALID_PLAN_MAPPING');
      return null;
    }

    return plan;
  }

  private async importReadyCreateRow(
    normalized: NormalizedLegacyClient,
    planId: string,
    payloadHash: string,
  ): Promise<LegacyImportResultRow> {
    const required = this.importableNormalizedClient(normalized);

    if (!required) {
      return {
        code: 'INVALID_IMPORT_ROW',
        legacyClientId: normalized.legacyClientId,
        message: 'Registro nao possui dados normalizados suficientes para importacao.',
        result: 'SKIPPED',
      };
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const plan = await tx.plan.findUnique({ where: { id: planId } });

        if (
          !plan ||
          !plan.active ||
          plan.durationMonths !== billingCycleMonths[required.planCycle]
        ) {
          throw new LegacyImportSkip(
            'INVALID_PLAN_MAPPING',
            'Plano nao esta mais valido para este ciclo.',
          );
        }

        const existingImportRecord = await tx.legacyImportRecord.findFirst({
          where: { source, legacyClientId: required.legacyClientId },
        });

        if (existingImportRecord) {
          return {
            code: existingImportRecord.payloadHash === payloadHash ? 'UNCHANGED' : 'READY_UPDATE',
            ...(existingImportRecord.crmClientId
              ? { crmClientId: existingImportRecord.crmClientId }
              : {}),
            ...(existingImportRecord.crmClientReferenceId
              ? { crmClientReferenceId: existingImportRecord.crmClientReferenceId }
              : {}),
            legacyClientId: required.legacyClientId,
            message:
              existingImportRecord.payloadHash === payloadHash
                ? 'Registro legado ja foi importado sem alteracoes.'
                : 'Registro legado ja possui importacao previa e nao sera atualizado nesta etapa.',
            result: 'SKIPPED' as const,
          };
        }

        await this.ensureNoCurrentMatches(tx, required);

        const client = await tx.client.create({
          data: {
            billingAnchorDay: required.billingAnchorDay,
            billingNoticeDays: required.billingNoticeDays,
            dueDate: required.dueDate,
            email: required.email,
            name: required.name,
            notes: required.notes,
            phone: required.phone,
            phoneNormalized: required.phoneNormalized,
            planId,
            recurringValue: required.recurringValue,
            reference: required.reference,
            status: required.status,
          },
        });
        const clientReference = await tx.clientReference.create({
          data: {
            billingAnchorDay: required.billingAnchorDay,
            billingNoticeDays: required.billingNoticeDays,
            clientId: client.id,
            dueDate: required.dueDate,
            notes: required.notes,
            planId,
            recurringValue: required.recurringValue,
            reference: required.reference,
            status: required.status,
          },
        });

        await tx.legacyImportRecord.create({
          data: {
            crmClientId: client.id,
            crmClientReferenceId: clientReference.id,
            errorCode: null,
            legacyClientId: required.legacyClientId,
            payloadHash,
            source,
            status: 'IMPORTED',
          },
        });

        return {
          code: 'IMPORTED',
          crmClientId: client.id,
          crmClientReferenceId: clientReference.id,
          legacyClientId: required.legacyClientId,
          message: 'Cliente importado.',
          result: 'IMPORTED' as const,
        };
      });
    } catch (error) {
      if (error instanceof LegacyImportSkip) {
        return {
          code: error.code,
          legacyClientId: required.legacyClientId,
          message: error.message,
          result: 'SKIPPED',
        };
      }

      if (this.isUniqueConstraint(error)) {
        return {
          code: 'CONFLICT',
          legacyClientId: required.legacyClientId,
          message: 'Registro entrou em conflito com dados criados durante a importacao.',
          result: 'FAILED',
        };
      }

      throw error;
    }
  }

  private async importReadyPaidHistoryRow(
    row: LegacyPaymentPreviewRow,
  ): Promise<LegacyPaymentImportResultRow> {
    const required = this.importablePaymentPreviewRow(row);

    if (!required) {
      return {
        code: 'INVALID_IMPORT_ROW',
        legacyClientId: row.legacyClientId,
        legacyPaymentId: row.legacyPaymentId,
        message: 'Pagamento nao possui dados validados suficientes para importacao historica.',
        result: 'SKIPPED',
      };
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const currentState = await this.revalidatePaymentImportInsideTransaction(tx, required);
        if (currentState) {
          return currentState;
        }

        const financialTransaction = await tx.financialTransaction.create({
          data: {
            amount: required.amount,
            categoryId: required.categoryId,
            clientId: required.crmClientId,
            clientReferenceId: required.crmClientReferenceId,
            description: 'Receita histórica importada',
            notes: required.observation,
            origin: 'LEGACY_IMPORT',
            paymentMethod: required.paymentMethod,
            receivableId: null,
            transactionDate: required.transactionDate,
            type: 'ENTRADA',
          },
        });

        await tx.legacyFinancialImportRecord.create({
          data: {
            crmClientId: required.crmClientId,
            crmClientReferenceId: required.crmClientReferenceId,
            errorCode: null,
            financialTransactionId: financialTransaction.id,
            legacyClientId: required.legacyClientId,
            legacyPaymentId: required.legacyPaymentId,
            payloadHash: required.payloadHash,
            receivableId: null,
            source,
            status: 'IMPORTED',
          },
        });

        return {
          code: 'IMPORTED',
          financialTransactionId: financialTransaction.id,
          legacyClientId: required.legacyClientId,
          legacyPaymentId: required.legacyPaymentId,
          message: 'Pagamento historico importado.',
          result: 'IMPORTED' as const,
        };
      });
    } catch (error) {
      if (this.isUniqueConstraint(error)) {
        return {
          code: 'UNCHANGED',
          legacyClientId: required.legacyClientId,
          legacyPaymentId: required.legacyPaymentId,
          message: 'Pagamento legado ja foi importado por outra execucao.',
          result: 'SKIPPED',
        };
      }

      throw error;
    }
  }

  private async revalidatePaymentImportInsideTransaction(
    tx: Prisma.TransactionClient,
    required: NonNullable<ReturnType<LegacyImportService['importablePaymentPreviewRow']>>,
  ): Promise<LegacyPaymentImportResultRow | null> {
    const [categories, clientMapping, existingFinancialRecord] = await Promise.all([
      tx.financialCategory.findMany({
        where: {
          name: { equals: 'Receita histórica', mode: 'insensitive' },
          type: 'ENTRADA',
        },
      }),
      tx.legacyImportRecord.findFirst({
        where: { legacyClientId: required.legacyClientId, source },
      }),
      tx.legacyFinancialImportRecord.findFirst({
        where: { legacyPaymentId: required.legacyPaymentId, source },
      }),
    ]);

    const category = categories.find((item) => item.active) ?? null;

    if (categories.length !== 1 || !category || category.id !== required.categoryId) {
      return {
        code: 'CATEGORY_CHANGED',
        legacyClientId: required.legacyClientId,
        legacyPaymentId: required.legacyPaymentId,
        message: 'Categoria Receita histórica nao esta valida para importacao.',
        result: 'SKIPPED',
      };
    }

    if (
      !clientMapping ||
      clientMapping.status !== 'IMPORTED' ||
      clientMapping.crmClientId !== required.crmClientId ||
      clientMapping.crmClientReferenceId !== required.crmClientReferenceId
    ) {
      return {
        code: 'ORPHAN_LEGACY_CLIENT_MAPPING',
        legacyClientId: required.legacyClientId,
        legacyPaymentId: required.legacyPaymentId,
        message: 'Mapeamento do cliente legado mudou antes da importacao.',
        result: 'SKIPPED',
      };
    }

    const [client, reference] = await Promise.all([
      tx.client.findUnique({ where: { id: required.crmClientId }, select: { id: true } }),
      tx.clientReference.findUnique({
        where: { id: required.crmClientReferenceId },
        select: { clientId: true, id: true },
      }),
    ]);

    if (!client || !reference || reference.clientId !== required.crmClientId) {
      return {
        code: 'ORPHAN_LEGACY_CLIENT_MAPPING',
        legacyClientId: required.legacyClientId,
        legacyPaymentId: required.legacyPaymentId,
        message: 'Cliente ou referencia mudou antes da importacao.',
        result: 'SKIPPED',
      };
    }

    if (!existingFinancialRecord) {
      return null;
    }

    if (
      !existingFinancialRecord.crmClientId ||
      !existingFinancialRecord.crmClientReferenceId ||
      !existingFinancialRecord.financialTransactionId
    ) {
      return {
        code: 'ORPHAN_FINANCIAL_MAPPING',
        legacyClientId: required.legacyClientId,
        legacyPaymentId: required.legacyPaymentId,
        message: 'Mapeamento financeiro legado esta incompleto.',
        result: 'SKIPPED',
      };
    }

    const transaction = await tx.financialTransaction.findUnique({
      where: { id: existingFinancialRecord.financialTransactionId },
      select: { clientId: true, clientReferenceId: true, id: true },
    });

    if (
      !transaction ||
      transaction.clientId !== existingFinancialRecord.crmClientId ||
      transaction.clientReferenceId !== existingFinancialRecord.crmClientReferenceId
    ) {
      return {
        code: 'ORPHAN_FINANCIAL_MAPPING',
        legacyClientId: required.legacyClientId,
        legacyPaymentId: required.legacyPaymentId,
        message: 'Mapeamento financeiro legado esta orfao ou inconsistente.',
        result: 'SKIPPED',
      };
    }

    return {
      code:
        existingFinancialRecord.payloadHash === required.payloadHash
          ? 'UNCHANGED'
          : 'UPDATE_NOT_SUPPORTED',
      financialTransactionId: existingFinancialRecord.financialTransactionId,
      legacyClientId: required.legacyClientId,
      legacyPaymentId: required.legacyPaymentId,
      message:
        existingFinancialRecord.payloadHash === required.payloadHash
          ? 'Pagamento legado ja foi importado sem alteracoes.'
          : 'Pagamento legado ja possui importacao previa com payload diferente.',
      result: 'SKIPPED',
    };
  }

  private importablePaymentPreviewRow(row: LegacyPaymentPreviewRow) {
    if (
      row.classification !== 'READY_PAID_HISTORY' ||
      !row.amount ||
      !row.category?.id ||
      !row.crmClientId ||
      !row.crmClientReferenceId ||
      !row.legacyClientId ||
      !row.legacyPaymentId ||
      !row.paymentMethod ||
      !row.payloadHash ||
      !row.transactionDate
    ) {
      return null;
    }

    return {
      amount: new Prisma.Decimal(row.amount),
      categoryId: row.category.id,
      crmClientId: row.crmClientId,
      crmClientReferenceId: row.crmClientReferenceId,
      legacyClientId: row.legacyClientId,
      legacyPaymentId: row.legacyPaymentId,
      observation: row.observation,
      paymentMethod: row.paymentMethod,
      payloadHash: row.payloadHash,
      transactionDate: parseBusinessDate(row.transactionDate),
    };
  }

  private importableNormalizedClient(normalized: NormalizedLegacyClient) {
    const targetStatus = normalized.status;

    if (
      !normalized.billingAnchorDay ||
      normalized.billingNoticeDays === null ||
      !normalized.dueDate ||
      !normalized.legacyClientId ||
      !normalized.name ||
      !normalized.phone ||
      !normalized.phoneNormalized ||
      !normalized.planCycle ||
      !normalized.rawReference ||
      !normalized.recurringValue ||
      !targetStatus ||
      !this.isImportableLegacyClient(normalized)
    ) {
      return null;
    }

    return {
      billingAnchorDay: normalized.billingAnchorDay,
      billingNoticeDays: normalized.billingNoticeDays,
      dueDate: normalized.dueDate,
      email: normalized.email,
      legacyClientId: normalized.legacyClientId,
      name: normalized.name,
      notes: normalized.notes,
      phone: normalized.phone,
      phoneNormalized: normalized.phoneNormalized,
      planCycle: normalized.planCycle,
      recurringValue: normalized.recurringValue,
      reference: normalized.rawReference,
      status: targetStatus,
    };
  }

  private async ensureNoCurrentMatches(
    tx: Prisma.TransactionClient,
    normalized: NonNullable<ReturnType<LegacyImportService['importableNormalizedClient']>>,
  ) {
    const reference = await tx.clientReference.findUnique({
      where: { reference: normalized.reference },
      select: { id: true },
    });

    if (reference) {
      throw new LegacyImportSkip(
        'REFERENCE_MATCH',
        'Referencia foi criada por outro processo antes da importacao.',
      );
    }

    const client = await tx.client.findFirst({
      where: {
        OR: [
          { phoneNormalized: normalized.phoneNormalized },
          ...(normalized.email ? [{ email: normalized.email }] : []),
        ],
      },
      select: { id: true },
    });

    if (client) {
      throw new LegacyImportSkip(
        'POSSIBLE_MATCH',
        'Cliente semelhante foi criado antes da importacao.',
      );
    }
  }

  private validateHistoricalCategory(
    categories: FinancialCategoryLookup[],
    errors: string[],
    category: FinancialCategoryLookup | null,
  ) {
    if (!categories.length) {
      errors.push('CATEGORY_NOT_FOUND');
      return;
    }

    if (categories.some((item) => !item.active)) {
      errors.push('CATEGORY_INACTIVE');
      return;
    }

    if (!category || categories.length !== 1) {
      errors.push('CATEGORY_AMBIGUOUS');
    }
  }

  private validateLegacyClientMapping(
    importRecord: LegacyImportRecordLookup | null,
    lookups: Awaited<ReturnType<LegacyImportService['loadPaymentLookups']>>,
    errors: string[],
    warnings: string[],
  ) {
    if (!importRecord) {
      return;
    }

    if (importRecord.status !== 'IMPORTED') {
      errors.push('ORPHAN_LEGACY_CLIENT_MAPPING');
      warnings.push(orphanLegacyMappingMessage);
      return;
    }

    if (!importRecord.crmClientId || !importRecord.crmClientReferenceId) {
      errors.push('ORPHAN_LEGACY_CLIENT_MAPPING');
      warnings.push(orphanLegacyMappingMessage);
      return;
    }

    const client = lookups.mappedClients.get(importRecord.crmClientId);
    const reference = lookups.mappedClientReferences.get(importRecord.crmClientReferenceId);

    if (!client || !reference || reference.clientId !== importRecord.crmClientId) {
      errors.push('ORPHAN_LEGACY_CLIENT_MAPPING');
      warnings.push(orphanLegacyMappingMessage);
    }
  }

  private validateExistingFinancialMapping(
    record: LegacyFinancialImportRecordLookup | null,
    lookups: Awaited<ReturnType<LegacyImportService['loadPaymentLookups']>>,
    errors: string[],
    warnings: string[],
  ) {
    if (!record) {
      return;
    }

    if (!record.crmClientId || !record.crmClientReferenceId || !record.financialTransactionId) {
      errors.push('ORPHAN_FINANCIAL_MAPPING');
      warnings.push('Existe um vínculo financeiro legado incompleto.');
      return;
    }

    const client = lookups.mappedClients.get(record.crmClientId);
    const reference = lookups.mappedClientReferences.get(record.crmClientReferenceId);
    const transaction = lookups.financialTransactions.get(record.financialTransactionId);

    if (
      !client ||
      !reference ||
      reference.clientId !== record.crmClientId ||
      !transaction ||
      transaction.clientId !== record.crmClientId ||
      transaction.clientReferenceId !== record.crmClientReferenceId
    ) {
      errors.push('ORPHAN_FINANCIAL_MAPPING');
      warnings.push('Existe um vínculo financeiro legado órfão ou inconsistente.');
    }
  }

  private classifyPayment(input: {
    errors: string[];
    existingFinancialRecord: LegacyFinancialImportRecordLookup | null;
    legacyClientMapping: LegacyImportRecordLookup | null;
    normalized: NormalizedLegacyPayment;
    payloadHash: string | null;
  }): LegacyPaymentPreviewClassification {
    if (input.errors.some((error) => error.startsWith('INVALID_'))) {
      return 'INVALID';
    }

    if (
      input.errors.some((error) =>
        [
          'CATEGORY_AMBIGUOUS',
          'CATEGORY_INACTIVE',
          'CATEGORY_NOT_FOUND',
          'DUPLICATE_LEGACY_PAYMENT_ID_IN_FILE',
          'ORPHAN_FINANCIAL_MAPPING',
          'ORPHAN_LEGACY_CLIENT_MAPPING',
        ].includes(error),
      )
    ) {
      return 'CONFLICT';
    }

    if (
      input.existingFinancialRecord &&
      input.payloadHash &&
      input.existingFinancialRecord.payloadHash === input.payloadHash
    ) {
      return 'UNCHANGED';
    }

    if (
      input.existingFinancialRecord &&
      input.payloadHash &&
      input.existingFinancialRecord.payloadHash !== input.payloadHash
    ) {
      return 'CONFLICT';
    }

    if (!input.legacyClientMapping) {
      return 'CLIENT_NOT_IMPORTED';
    }

    if (input.normalized.status === 'PENDENTE') {
      return 'PENDING_NOT_SUPPORTED';
    }

    if (input.normalized.transactionType !== 'RECEITA') {
      return 'UNSUPPORTED';
    }

    if (input.normalized.status !== 'PAGO') {
      return 'UNSUPPORTED';
    }

    return 'READY_PAID_HISTORY';
  }

  private paymentHashable(
    normalized: NormalizedLegacyPayment,
    category: FinancialCategoryLookup | null,
    crmClientId: string | null,
    crmClientReferenceId: string | null,
  ) {
    return Boolean(
      normalized.amount &&
      normalized.legacyClientId &&
      normalized.legacyPaymentId &&
      normalized.paymentMethod &&
      normalized.status &&
      normalized.transactionDate &&
      normalized.transactionType &&
      category &&
      crmClientId &&
      crmClientReferenceId,
    );
  }

  private hashNormalizedPaymentPayload(
    normalized: NormalizedLegacyPayment,
    resolved: {
      categoryId: string;
      crmClientId: string | null;
      crmClientReferenceId: string | null;
    },
  ) {
    return createHash('sha256')
      .update(
        this.stableStringify({
          amount: normalized.amount,
          categoryId: resolved.categoryId,
          crmClientId: resolved.crmClientId,
          crmClientReferenceId: resolved.crmClientReferenceId,
          legacyClientId: normalized.legacyClientId,
          legacyPaymentId: normalized.legacyPaymentId,
          observation: normalized.observation,
          origin: 'LEGACY_IMPORT',
          paymentMethod: normalized.paymentMethod,
          source,
          status: normalized.status,
          transactionDate: normalized.transactionDate,
          transactionType: normalized.transactionType,
        }),
      )
      .digest('hex');
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
    if (input.errors.includes('INVALID_LEGACY_ID') || input.errors.includes('INVALID_STATUS')) {
      return 'INVALID';
    }

    if (input.errors.includes('DUPLICATE_LEGACY_ID_IN_FILE')) {
      return 'CONFLICT';
    }

    if (input.errors.includes('NOT_ACTIVE_EXISTING_MAPPING')) {
      return 'CONFLICT';
    }

    if (this.isSkippedLegacyClient(input.normalized)) {
      return 'SKIPPED_NOT_ACTIVE';
    }

    if (
      input.errors.some((error) => error.startsWith('INVALID_') && error !== 'INVALID_PLAN_MAPPING')
    ) {
      return 'INVALID';
    }

    if (
      input.errors.some((error) =>
        [
          'DUPLICATE_LEGACY_ID_IN_FILE',
          'DUPLICATE_REFERENCE_IN_FILE',
          'INCOMPLETE_LEGACY_MAPPING',
          'INVALID_PLAN_MAPPING',
          'ORPHAN_LEGACY_MAPPING',
          'PLAN_AMBIGUOUS',
          'PLAN_NOT_FOUND',
          'PLAN_NOT_MAPPED',
        ].includes(error),
      )
    ) {
      return 'CONFLICT';
    }

    if (this.hasStrongCandidateMatch(input.candidateMatches) && !input.importRecord) {
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

  private summarize(
    rows: Array<{
      classification: LegacyImportClassification;
      normalizedStatus: ClientStatus | null;
    }>,
  ) {
    return {
      total: rows.length,
      readyCreate: rows.filter((row) => row.classification === 'READY_CREATE').length,
      readyCreateActive: rows.filter(
        (row) => row.classification === 'READY_CREATE' && row.normalizedStatus === 'ATIVO',
      ).length,
      readyCreateCanceled: rows.filter(
        (row) => row.classification === 'READY_CREATE' && row.normalizedStatus === 'CANCELADO',
      ).length,
      readyUpdate: rows.filter((row) => row.classification === 'READY_UPDATE').length,
      unchanged: rows.filter((row) => row.classification === 'UNCHANGED').length,
      possibleMatch: rows.filter((row) => row.classification === 'POSSIBLE_MATCH').length,
      notActive: rows.filter((row) => row.classification === 'SKIPPED_NOT_ACTIVE').length,
      conflict: rows.filter((row) => row.classification === 'CONFLICT').length,
      invalid: rows.filter((row) => row.classification === 'INVALID').length,
    };
  }

  private summarizePayments(rows: Array<{ classification: LegacyPaymentPreviewClassification }>) {
    return {
      total: rows.length,
      readyPaidHistory: rows.filter((row) => row.classification === 'READY_PAID_HISTORY').length,
      unchanged: rows.filter((row) => row.classification === 'UNCHANGED').length,
      clientNotImported: rows.filter((row) => row.classification === 'CLIENT_NOT_IMPORTED').length,
      pending: rows.filter((row) => row.classification === 'PENDING_NOT_SUPPORTED').length,
      unsupported: rows.filter((row) => row.classification === 'UNSUPPORTED').length,
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

  private markDuplicateLegacyPaymentIds(
    rows: Array<{
      normalized: ReturnType<LegacyImportService['normalizePayment']>;
      errors: string[];
    }>,
  ) {
    this.markDuplicates(
      rows,
      (row) => row.normalized.value.legacyPaymentId,
      'DUPLICATE_LEGACY_PAYMENT_ID_IN_FILE',
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
      (row) =>
        this.isImportableLegacyClient(row.normalized.value)
          ? row.normalized.value.rawReference
          : null,
      'DUPLICATE_REFERENCE_IN_FILE',
    );
  }

  private isImportableLegacyClient(normalized: NormalizedLegacyClient) {
    return (
      (normalized.legacyStatus === 'Ativo' && normalized.status === 'ATIVO') ||
      (['Inativo', 'Cancelado'].includes(normalized.legacyStatus ?? '') &&
        normalized.status === 'CANCELADO')
    );
  }

  private isSkippedLegacyClient(normalized: NormalizedLegacyClient) {
    return ['Novo', 'Pendente'].includes(normalized.legacyStatus ?? '');
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

  private hasExistingReferenceWithoutImportRecord(
    candidateMatches: CandidateMatch[],
    importRecord: object | null,
  ) {
    return !importRecord && candidateMatches.some((match) => match.field === 'reference');
  }

  private hasStrongCandidateMatch(candidateMatches: CandidateMatch[]) {
    return candidateMatches.some((match) => match.field !== 'name');
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

  private isUniqueConstraint(error: unknown) {
    return (
      (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') ||
      (this.isRecord(error) && error.code === 'P2002')
    );
  }
}
