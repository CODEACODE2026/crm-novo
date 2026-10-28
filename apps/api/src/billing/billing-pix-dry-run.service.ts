import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type PaymentIntentStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { comparePhoneIdentities, normalizePhone } from '../common/phone/phone-normalizer';

const activePixStatuses: PaymentIntentStatus[] = ['CREATED', 'WAITING_PAYMENT'];
const defaultPageLimit = 100;
const maximumPageLimit = 100;
const cursorVersion = 1;
const cursorScope = 'billing-pix-dry-run:isCurrent=true';
const cursorOrder = 'nextAttemptAt:asc:nullsLast,createdAt:asc,id:asc';
const executionOrderBy = [
  { nextAttemptAt: { sort: 'asc' as const, nulls: 'last' as const } },
  { createdAt: 'asc' as const },
  { id: 'asc' as const },
] satisfies Prisma.BillingExecutionOrderByWithRelationInput[];
const executionInclude = {
  client: true,
  messageDispatch: { include: { whatsAppConnection: true, items: true } },
  paymentIntent: true,
  pixAttempts: { where: { isCurrent: true }, orderBy: { createdAt: 'desc' as const } },
  receivables: {
    include: {
      clientReference: true,
      receivable: {
        include: {
          paymentIntents: true,
          paymentGroupItems: {
            include: { paymentGroup: { include: { paymentIntents: true, items: true } } },
          },
        },
      },
    },
    orderBy: { receivableId: 'asc' as const },
  },
} satisfies Prisma.BillingExecutionInclude;

type DryRunExecution = Prisma.BillingExecutionGetPayload<{ include: typeof executionInclude }>;

type Exclusion = { code: string; message: string };

type DryRunCursor = {
  version: typeof cursorVersion;
  scope: typeof cursorScope;
  order: typeof cursorOrder;
  nextAttemptAt: string | null;
  createdAt: string;
  id: string;
};

export type BillingPixDryRunInput = {
  cursor?: string;
  limit?: string | number;
  now?: Date;
};

@Injectable()
export class BillingPixDryRunService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  async preview(input: BillingPixDryRunInput = {}) {
    const now = input.now ?? new Date();
    const limit = this.pageLimit(input.limit);
    const cursor = input.cursor === undefined ? null : this.decodeCursor(input.cursor);
    const executions = await this.prisma.billingExecution.findMany({
      where: {
        isCurrent: true,
        ...(cursor ? this.afterCursor(cursor) : {}),
      },
      include: executionInclude,
      orderBy: executionOrderBy,
      take: limit + 1,
    });
    const flags = this.flags();
    const hasMore = executions.length > limit;
    const page = executions.slice(0, limit);
    const candidates = page.map((execution) => this.inspect(execution, flags, now));
    const last = page.at(-1);

    return {
      generatedAt: now.toISOString(),
      mode: 'DRY_RUN',
      disclaimer: 'Preview informativo; o worker deve revalidar tudo sob lock antes de efeitos.',
      effects: {
        databaseWrites: 0,
        externalCalls: 0,
        leasesAcquired: 0,
        pixReservations: 0,
      },
      flags,
      pagination: {
        limit,
        pageCount: candidates.length,
        hasMore,
        nextCursor: hasMore && last ? this.encodeCursor(last) : null,
        coverage: hasMore ? 'PARTIAL' : 'COMPLETE',
        order: cursorOrder,
        consistency: 'BEST_EFFORT_NON_SNAPSHOT',
        concurrencyNotice:
          'Alteracoes entre paginas podem mover registros; reinicie da primeira pagina para uma nova varredura consistente.',
      },
      summary: {
        scanned: candidates.length,
        eligible: candidates.filter((candidate) => candidate.eligible).length,
        blocked: candidates.filter((candidate) => candidate.decision === 'BLOCKED').length,
        reviewRequired: candidates.filter((candidate) => candidate.decision === 'REVIEW_REQUIRED')
          .length,
      },
      candidates,
    };
  }

  private pageLimit(value: string | number | undefined) {
    if (value === undefined) return defaultPageLimit;
    const lexical = String(value);
    if (!/^[1-9][0-9]*$/.test(lexical)) {
      throw new BadRequestException('Limite do dry-run invalido.');
    }
    const parsed = Number(lexical);
    if (!Number.isSafeInteger(parsed) || parsed > maximumPageLimit) {
      throw new BadRequestException('Limite do dry-run deve estar entre 1 e 100.');
    }
    return parsed;
  }

  private encodeCursor(execution: Pick<DryRunExecution, 'id' | 'nextAttemptAt' | 'createdAt'>) {
    const payload: DryRunCursor = {
      version: cursorVersion,
      scope: cursorScope,
      order: cursorOrder,
      nextAttemptAt: execution.nextAttemptAt?.toISOString() ?? null,
      createdAt: execution.createdAt.toISOString(),
      id: execution.id,
    };
    return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  }

  private decodeCursor(value: unknown): DryRunCursor {
    if (
      typeof value !== 'string' ||
      value.length === 0 ||
      value.length > 2048 ||
      !/^[A-Za-z0-9_-]+$/.test(value) ||
      Buffer.from(value, 'base64url').toString('base64url') !== value
    ) {
      throw new BadRequestException('Cursor do dry-run invalido.');
    }
    try {
      const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown;
      if (!this.isCursor(parsed)) throw new Error('invalid cursor contract');
      return parsed;
    } catch {
      throw new BadRequestException('Cursor do dry-run invalido.');
    }
  }

  private isCursor(value: unknown): value is DryRunCursor {
    if (!value || typeof value !== 'object') return false;
    const cursor = value as Record<string, unknown>;
    if (
      Object.keys(cursor).sort().join(',') !== 'createdAt,id,nextAttemptAt,order,scope,version' ||
      cursor.version !== cursorVersion ||
      cursor.scope !== cursorScope ||
      cursor.order !== cursorOrder ||
      typeof cursor.createdAt !== 'string' ||
      typeof cursor.id !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
        cursor.id,
      ) ||
      (cursor.nextAttemptAt !== null && typeof cursor.nextAttemptAt !== 'string')
    ) {
      return false;
    }
    return (
      this.isCanonicalInstant(cursor.createdAt) &&
      (cursor.nextAttemptAt === null || this.isCanonicalInstant(cursor.nextAttemptAt))
    );
  }

  private isCanonicalInstant(value: string) {
    const instant = new Date(value);
    return !Number.isNaN(instant.getTime()) && instant.toISOString() === value;
  }

  private afterCursor(cursor: DryRunCursor): Prisma.BillingExecutionWhereInput {
    const createdAt = new Date(cursor.createdAt);
    if (cursor.nextAttemptAt === null) {
      return {
        nextAttemptAt: null,
        OR: [{ createdAt: { gt: createdAt } }, { createdAt, id: { gt: cursor.id } }],
      };
    }
    const nextAttemptAt = new Date(cursor.nextAttemptAt);
    return {
      OR: [
        { nextAttemptAt: { gt: nextAttemptAt } },
        { nextAttemptAt, createdAt: { gt: createdAt } },
        { nextAttemptAt, createdAt, id: { gt: cursor.id } },
        { nextAttemptAt: null },
      ],
    };
  }

  private inspect(
    execution: DryRunExecution,
    flags: ReturnType<BillingPixDryRunService['flags']>,
    now: Date,
  ) {
    const exclusions: Exclusion[] = [];
    const dispatch = execution.messageDispatch;
    const items = execution.receivables;
    const currentAttempt = execution.pixAttempts[0] ?? null;
    const total = items.reduce(
      (sum, item) => sum.add(item.receivable.amount),
      new Prisma.Decimal('0.00'),
    );

    this.require(
      exclusions,
      flags.pixEnabled,
      'PIX_FLAG_DISABLED',
      'Automacao PIX esta desligada.',
    );
    this.require(
      exclusions,
      dispatch.origin === 'BILLING',
      'DISPATCH_ORIGIN_INVALID',
      'Dispatch nao pertence ao Billing.',
    );
    this.require(
      exclusions,
      ['SCHEDULED', 'FAILED'].includes(dispatch.status),
      'DISPATCH_STATUS_INELIGIBLE',
      `Dispatch em estado ${dispatch.status}.`,
    );
    this.require(
      exclusions,
      ['SCHEDULED', 'PROCESSING', 'WAITING_PIX'].includes(execution.status),
      'EXECUTION_STATUS_INELIGIBLE',
      `Execucao em estado ${execution.status}.`,
    );
    this.require(
      exclusions,
      execution.client.status === 'ATIVO',
      'CLIENT_INACTIVE',
      'Cliente nao esta ativo.',
    );
    this.require(exclusions, items.length > 0, 'EMPTY_FINANCIAL_SET', 'Execucao sem recebiveis.');

    const dispatchSet = new Set(dispatch.items.map((item) => item.receivableId));
    const executionSet = new Set(items.map((item) => item.receivableId));
    this.require(
      exclusions,
      dispatchSet.size === executionSet.size &&
        [...executionSet].every((id) => dispatchSet.has(id)),
      'FINANCIAL_SET_MISMATCH',
      'Conjunto do dispatch diverge da execucao.',
    );

    for (const item of items) {
      this.require(
        exclusions,
        item.receivable.status === 'PENDENTE',
        'RECEIVABLE_NOT_PENDING',
        `Recebivel ${item.receivableId} nao esta pendente.`,
      );
      this.require(
        exclusions,
        item.clientReference.status === 'ATIVO',
        'REFERENCE_INACTIVE',
        `Referencia ${item.clientReference.reference} nao esta ativa.`,
      );
      if (execution.authorizationMode !== 'LEGACY_BRAZIL') {
        this.require(
          exclusions,
          item.clientReference.internationalBillingEnabled,
          'REFERENCE_OPT_IN_REQUIRED',
          `Referencia ${item.clientReference.reference} sem opt-in financeiro internacional.`,
        );
      }
      this.require(
        exclusions,
        item.receivable.amount.equals(item.amountSnapshot) &&
          this.dateKey(item.receivable.dueDate) === this.dateKey(item.dueDateSnapshot),
        'FINANCIAL_SNAPSHOT_MISMATCH',
        `Recebivel ${item.receivableId} diverge do snapshot aprovado.`,
      );
    }

    const phone = this.inspectPhone(execution);
    if (!phone.valid) exclusions.push({ code: phone.code, message: phone.message });
    const connection = dispatch.whatsAppConnection;
    this.require(
      exclusions,
      Boolean(connection),
      'WHATSAPP_CONNECTION_MISSING',
      'Conexao WhatsApp nao vinculada.',
    );
    if (connection) {
      this.require(
        exclusions,
        connection.status === 'CONNECTED' && connection.connected && connection.loggedIn,
        'WHATSAPP_CONNECTION_NOT_OPERATIONAL',
        'Conexao WhatsApp vinculada nao esta operacional.',
      );
    }

    if (execution.authorizationMode === 'GLOBAL_INTERNATIONAL') {
      this.require(
        exclusions,
        flags.billingEnabled,
        'GLOBAL_BILLING_DISABLED',
        'Billing global esta desligado.',
      );
      this.require(
        exclusions,
        Boolean(flags.effectiveFrom),
        'GLOBAL_CUTOFF_MISSING',
        'Cutoff global ausente.',
      );
      if (flags.effectiveFrom && dispatch.scheduledFor) {
        this.require(
          exclusions,
          dispatch.scheduledFor >= new Date(flags.effectiveFrom),
          'GLOBAL_BEFORE_CUTOFF',
          'Agendamento anterior ao cutoff global.',
        );
      }
    }

    const activeIntents = this.activeIntents(execution);
    const reusable = activeIntents.find((intent) =>
      this.isReusableIntent(intent, execution, total, now),
    );
    if (activeIntents.length > 0 && !reusable) {
      exclusions.push({
        code: 'ACTIVE_PIX_INCOMPATIBLE',
        message: 'Existe PIX ativo, mas ele nao corresponde ao conjunto, valor ou validade atuais.',
      });
    }

    const needsReview =
      execution.reviewRequired ||
      execution.status === 'REVIEW_REQUIRED' ||
      execution.pixStatus === 'AMBIGUOUS' ||
      execution.deliveryStatus === 'AMBIGUOUS' ||
      currentAttempt?.status === 'AMBIGUOUS' ||
      currentAttempt?.reviewRequired === true;
    if (needsReview) {
      exclusions.push({
        code: 'REVIEW_REQUIRED',
        message: 'Execucao ou tentativa exige revisao humana antes de qualquer efeito.',
      });
    }

    const uniqueExclusions = this.uniqueExclusions(exclusions);
    const decision = needsReview
      ? 'REVIEW_REQUIRED'
      : uniqueExclusions.length
        ? 'BLOCKED'
        : reusable
          ? 'REUSE_PIX'
          : 'CREATE_PIX_CANDIDATE';

    return {
      executionId: execution.id,
      executionKey: execution.executionKey,
      dispatchId: dispatch.id,
      decision,
      eligible: uniqueExclusions.length === 0,
      authorizationMode: execution.authorizationMode,
      cycleKey: execution.cycleKey,
      scheduledFor: dispatch.scheduledFor?.toISOString() ?? null,
      timing: dispatch.scheduledFor && dispatch.scheduledFor > now ? 'FUTURE' : 'DUE',
      client: { id: execution.client.id, reference: execution.client.reference, e164: phone.e164 },
      connection: connection
        ? {
            id: connection.id,
            provider: connection.provider,
            operational:
              connection.status === 'CONNECTED' && connection.connected && connection.loggedIn,
          }
        : null,
      financialSet: {
        hash: execution.receivableSetHash,
        total: total.toFixed(2),
        receivables: items.map((item) => ({
          id: item.receivableId,
          referenceId: item.clientReferenceId,
          reference: item.clientReference.reference,
          amount: item.receivable.amount.toFixed(2),
          dueDate: this.dateKey(item.receivable.dueDate),
          status: item.receivable.status,
          optIn: item.clientReference.internationalBillingEnabled,
        })),
      },
      paymentIntent: reusable
        ? { id: reusable.id, provider: reusable.provider, status: reusable.status, reusable: true }
        : activeIntents[0]
          ? {
              id: activeIntents[0].id,
              provider: activeIntents[0].provider,
              status: activeIntents[0].status,
              reusable: false,
            }
          : null,
      pixAttempt: currentAttempt
        ? {
            id: currentAttempt.id,
            status: currentAttempt.status,
            reviewRequired: currentAttempt.reviewRequired,
          }
        : null,
      exclusions: uniqueExclusions,
    };
  }

  private inspectPhone(execution: DryRunExecution) {
    const e164 = execution.client.phoneE164?.trim() ?? '';
    const canonical = e164
      ? normalizePhone(e164)
      : normalizePhone(execution.client.phone, { defaultCountry: 'BR' });
    if (canonical.status !== 'valid') {
      return {
        valid: false as const,
        e164: null,
        code: 'PHONE_INVALID',
        message: 'Telefone E.164 invalido.',
      };
    }
    const normalizedMatches = execution.client.phoneNormalized === canonical.digits;
    const original = normalizePhone(
      execution.client.phone,
      execution.authorizationMode === 'LEGACY_BRAZIL' ? { defaultCountry: 'BR' } : {},
    );
    const originalMatches =
      original.status === 'valid' &&
      comparePhoneIdentities(original.e164, canonical.e164).status === 'match';
    if (!normalizedMatches || !originalMatches) {
      return {
        valid: false as const,
        e164: canonical.e164,
        code: 'PHONE_IDENTITY_MISMATCH',
        message: 'Identidades telefonicas divergentes.',
      };
    }
    return { valid: true as const, e164: canonical.e164 };
  }

  private activeIntents(execution: DryRunExecution) {
    const intents = [
      ...(execution.paymentIntent ? [execution.paymentIntent] : []),
      ...execution.receivables.flatMap((item) => [
        ...item.receivable.paymentIntents,
        ...item.receivable.paymentGroupItems.flatMap(
          (groupItem) => groupItem.paymentGroup.paymentIntents,
        ),
      ]),
    ];
    return [
      ...new Map(
        intents
          .filter((intent) => activePixStatuses.includes(intent.status))
          .map((intent) => [intent.id, intent]),
      ).values(),
    ];
  }

  private isReusableIntent(
    intent: ReturnType<BillingPixDryRunService['activeIntents']>[number],
    execution: DryRunExecution,
    total: Prisma.Decimal,
    now: Date,
  ) {
    if (!intent.providerTransactionId || !intent.pixCopyPaste || !intent.amount.equals(total))
      return false;
    if (intent.expiresAt && intent.expiresAt <= now) return false;
    const expected = new Set(execution.receivables.map((item) => item.receivableId));
    if (intent.receivableId) return expected.size === 1 && expected.has(intent.receivableId);
    const group = execution.receivables
      .flatMap((item) => item.receivable.paymentGroupItems)
      .find((item) => item.paymentGroupId === intent.paymentGroupId)?.paymentGroup;
    if (!group) return false;
    const actual = new Set(group.items.map((item) => item.receivableId));
    return actual.size === expected.size && [...expected].every((id) => actual.has(id));
  }

  private flags() {
    return {
      billingEnabled: this.config.get<string>('PHONE_GLOBAL_BILLING_ENABLED') === 'true',
      pixEnabled: this.config.get<string>('PHONE_GLOBAL_BILLING_PIX_ENABLED') === 'true',
      sendEnabled: this.config.get<string>('PHONE_GLOBAL_BILLING_SEND_ENABLED') === 'true',
      effectiveFrom: this.validInstant(
        this.config.get<string>('PHONE_GLOBAL_BILLING_EFFECTIVE_FROM'),
      ),
    };
  }

  private validInstant(value: string | undefined) {
    const timestamp = value ? Date.parse(value) : Number.NaN;
    return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
  }

  private require(exclusions: Exclusion[], condition: boolean, code: string, message: string) {
    if (!condition) exclusions.push({ code, message });
  }

  private uniqueExclusions(exclusions: Exclusion[]) {
    return [...new Map(exclusions.map((item) => [item.code, item])).values()];
  }

  private dateKey(value: Date) {
    return value.toISOString().slice(0, 10);
  }
}
