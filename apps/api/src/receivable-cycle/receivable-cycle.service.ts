import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ClientReference, Prisma, Receivable } from '@prisma/client';
import { formatBusinessDate, parseBusinessDate } from '../clients/utils/business-date';
import { PrismaService } from '../common/prisma/prisma.service';

export type CycleIssueCode =
  | 'OK'
  | 'MISSING_RECEIVABLE'
  | 'RECEIVABLE_DIVERGENT'
  | 'RECEIVABLE_PAID'
  | 'RECEIVABLE_CANCELED'
  | 'REFERENCE_NOT_BILLABLE';

type DbClient = PrismaService | Prisma.TransactionClient;

type ReferenceWithRelations = Prisma.ClientReferenceGetPayload<{
  include: {
    client: true;
    plan: true;
    receivables: { orderBy: { createdAt: 'desc' } };
  };
}>;

@Injectable()
export class ReceivableCycleService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async ensureCurrentCycleReceivable(clientReferenceId: string, db: DbClient = this.prisma) {
    const reference = await this.findReference(clientReferenceId, db);

    if (!reference) {
      throw new NotFoundException('Referencia do cliente nao encontrada.');
    }

    const status = this.classifyReference(reference);

    if (status.sameCycleReceivables.length > 1) {
      throw new ConflictException('Ciclo financeiro possui contas a receber duplicadas.');
    }

    if (status.code === 'OK' && status.receivable) {
      return { action: 'kept' as const, receivable: status.receivable, status };
    }

    if (!this.isBillable(reference)) {
      throw new ConflictException('Referencia nao esta elegivel para gerar conta a receber.');
    }

    if (status.code === 'RECEIVABLE_PAID') {
      throw new ConflictException('Conta a receber do ciclo atual ja foi paga.');
    }

    if (status.code === 'RECEIVABLE_CANCELED') {
      throw new ConflictException('Conta a receber do ciclo atual foi cancelada.');
    }

    if (status.code === 'RECEIVABLE_DIVERGENT') {
      throw new ConflictException(
        'Ja existe uma conta a receber pendente com vencimento divergente para esta referencia. Resolva a divergencia antes de gerar uma nova conta.',
      );
    }

    let receivable: Receivable;

    try {
      receivable = await db.receivable.create({
        data: this.buildReceivableData(reference),
      });
    } catch (error) {
      if (!this.isUniqueConstraint(error)) {
        throw error;
      }

      const current = await this.findReference(clientReferenceId, db);
      const currentStatus = current ? this.classifyReference(current) : null;

      if (currentStatus?.code === 'OK' && currentStatus.receivable) {
        return {
          action: 'kept' as const,
          receivable: currentStatus.receivable,
          status: currentStatus,
        };
      }

      throw new ConflictException('Ciclo financeiro possui conta a receber conflitante.');
    }

    return {
      action: 'created' as const,
      receivable,
      status: this.classifyReference({ ...reference, receivables: [receivable] }),
    };
  }

  async previewCurrentCycleReceivable(clientReferenceId: string, db: DbClient = this.prisma) {
    const reference = await this.findReference(clientReferenceId, db);

    if (!reference) {
      throw new NotFoundException('Referencia do cliente nao encontrada.');
    }

    const status = this.classifyReference(reference);

    return {
      allowed: this.canCreate(reference, status),
      status,
      preview: this.isBillable(reference)
        ? {
            clientReferenceId: reference.id,
            reference: reference.reference,
            amount: reference.recurringValue.toFixed(2),
            dueDate: formatBusinessDate(reference.dueDate),
            purpose: 'RENEWAL',
            description: this.buildRenewalReceivableDescription(reference.plan.name),
          }
        : null,
    };
  }

  async reconcileCurrentCycles(options: { createMissing?: boolean } = {}) {
    const references = await this.findBillableReferences(this.prisma);
    const items = [];

    for (const reference of references) {
      let status = this.classifyReference(reference);
      let receivable: Receivable | null = status.receivable;

      if (options.createMissing && this.canCreate(reference, status)) {
        const result = await this.ensureCurrentCycleReceivable(reference.id);
        status = result.status;
        receivable = result.receivable;
      }

      items.push(this.presentCycle(reference, status, receivable));
    }

    return {
      counts: this.countStatuses(items),
      items,
    };
  }

  async listOperationalIssues(limit = 20) {
    const today = parseBusinessDate(formatBusinessDate(new Date()));
    const references = await this.prisma.clientReference.findMany({
      where: {
        status: 'ATIVO',
        billingNoticeDays: { gte: 0 },
        recurringValue: { gt: 0 },
        dueDate: { gte: today },
      },
      include: {
        client: true,
        plan: true,
        receivables: { orderBy: { createdAt: 'desc' } },
      },
      orderBy: [{ dueDate: 'asc' }, { reference: 'asc' }],
      take: limit * 3,
    });

    return references
      .map((reference) => this.presentCycle(reference, this.classifyReference(reference), null))
      .filter((item) => ['MISSING_RECEIVABLE', 'RECEIVABLE_DIVERGENT'].includes(item.code))
      .slice(0, limit);
  }

  async updatePendingCurrentCycleReceivable(
    clientReferenceId: string,
    previousDueDate: Date,
    next: { dueDate: Date; amount: Prisma.Decimal | number | string; planName: string },
    db: DbClient = this.prisma,
  ) {
    const currentCycle = await db.receivable.findMany({
      where: {
        clientReferenceId,
        purpose: 'RENEWAL',
        dueDate: previousDueDate,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!currentCycle.length) {
      return null;
    }

    if (currentCycle.length > 1) {
      throw new ConflictException('Ciclo financeiro possui contas a receber duplicadas.');
    }

    const [receivable] = currentCycle;

    if (!receivable) {
      return null;
    }

    if (receivable.status === 'PAGO') {
      throw new ConflictException('Conta a receber paga nao pode ter vencimento reescrito.');
    }

    if (receivable.status === 'CANCELADO') {
      throw new ConflictException('Conta a receber cancelada nao pode ser reescrita.');
    }

    return db.receivable.update({
      where: { id: receivable.id },
      data: {
        dueDate: next.dueDate,
        amount: next.amount,
        description: this.buildRenewalReceivableDescription(next.planName),
      },
    });
  }

  async cancelPendingCurrentCycleReceivable(
    clientReferenceId: string,
    dueDate: Date,
    reason: string,
    db: DbClient = this.prisma,
  ) {
    const currentCycle = await db.receivable.findMany({
      where: { clientReferenceId, purpose: 'RENEWAL', dueDate },
      orderBy: { createdAt: 'desc' },
    });

    if (!currentCycle.length) {
      return null;
    }

    if (currentCycle.length > 1) {
      throw new ConflictException('Ciclo financeiro possui contas a receber duplicadas.');
    }

    const [receivable] = currentCycle;

    if (!receivable || receivable.status !== 'PENDENTE') {
      return null;
    }

    return db.receivable.update({
      where: { id: receivable.id },
      data: {
        status: 'CANCELADO',
        canceledAt: new Date(),
        cancelReason: reason,
      },
    });
  }

  private async findReference(clientReferenceId: string, db: DbClient) {
    return db.clientReference.findUnique({
      where: { id: clientReferenceId },
      include: {
        client: true,
        plan: true,
        receivables: { orderBy: { createdAt: 'desc' } },
      },
    });
  }

  private async findBillableReferences(db: DbClient) {
    return db.clientReference.findMany({
      where: {
        status: 'ATIVO',
        billingNoticeDays: { gte: 0 },
        recurringValue: { gt: 0 },
      },
      include: {
        client: true,
        plan: true,
        receivables: { orderBy: { createdAt: 'desc' } },
      },
      orderBy: [{ dueDate: 'asc' }, { reference: 'asc' }],
    });
  }

  private classifyReference(reference: ReferenceWithRelations) {
    const sameCycleReceivables = reference.receivables.filter(
      (receivable) =>
        receivable.purpose === 'RENEWAL' &&
        formatBusinessDate(receivable.dueDate) === formatBusinessDate(reference.dueDate),
    );
    const receivable = sameCycleReceivables[0] ?? null;

    if (!this.isBillable(reference)) {
      return {
        code: 'REFERENCE_NOT_BILLABLE' as const,
        reason: 'Referencia nao esta elegivel para cobranca.',
        receivable,
        sameCycleReceivables,
      };
    }

    if (sameCycleReceivables.some((item) => item.status === 'PENDENTE')) {
      return {
        code: 'OK' as const,
        reason: 'Conta a receber pendente do ciclo atual encontrada.',
        receivable: sameCycleReceivables.find((item) => item.status === 'PENDENTE') ?? receivable,
        sameCycleReceivables,
      };
    }

    if (sameCycleReceivables.some((item) => item.status === 'PAGO')) {
      return {
        code: 'RECEIVABLE_PAID' as const,
        reason: 'Conta a receber do ciclo atual ja foi paga.',
        receivable: sameCycleReceivables.find((item) => item.status === 'PAGO') ?? receivable,
        sameCycleReceivables,
      };
    }

    if (sameCycleReceivables.some((item) => item.status === 'CANCELADO')) {
      return {
        code: 'RECEIVABLE_CANCELED' as const,
        reason: 'Conta a receber do ciclo atual foi cancelada.',
        receivable: sameCycleReceivables.find((item) => item.status === 'CANCELADO') ?? receivable,
        sameCycleReceivables,
      };
    }

    const hasDivergentRenewal = reference.receivables.some(
      (item) => item.purpose === 'RENEWAL' && item.status === 'PENDENTE',
    );

    return {
      code: hasDivergentRenewal
        ? ('RECEIVABLE_DIVERGENT' as const)
        : ('MISSING_RECEIVABLE' as const),
      reason: hasDivergentRenewal
        ? 'Conta a receber pendente existe, mas com vencimento divergente.'
        : 'Sem conta a receber para o ciclo atual.',
      receivable: null,
      sameCycleReceivables,
    };
  }

  private canCreate(
    reference: ReferenceWithRelations,
    status: ReturnType<ReceivableCycleService['classifyReference']>,
  ) {
    return this.isBillable(reference) && status.code === 'MISSING_RECEIVABLE';
  }

  private isBillable(
    reference: Pick<ClientReference, 'status' | 'billingNoticeDays' | 'recurringValue'>,
  ) {
    return (
      reference.status === 'ATIVO' &&
      reference.billingNoticeDays >= 0 &&
      Number(reference.recurringValue) > 0
    );
  }

  private buildReceivableData(reference: ReferenceWithRelations) {
    return {
      clientId: reference.clientId,
      clientReferenceId: reference.id,
      purpose: 'RENEWAL' as const,
      description: this.buildRenewalReceivableDescription(reference.plan.name),
      amount: reference.recurringValue,
      dueDate: reference.dueDate,
      status: 'PENDENTE' as const,
    };
  }

  private buildRenewalReceivableDescription(planName: string) {
    return `Renovacao - Plano ${planName}`;
  }

  private presentCycle(
    reference: ReferenceWithRelations,
    status: ReturnType<ReceivableCycleService['classifyReference']>,
    receivable: Receivable | null,
  ) {
    const linkedReceivable = receivable ?? status.receivable;

    return {
      clientId: reference.clientId,
      clientName: reference.client.name,
      clientReferenceId: reference.id,
      reference: reference.reference,
      planName: reference.plan.name,
      amount: reference.recurringValue.toFixed(2),
      dueDate: formatBusinessDate(reference.dueDate),
      code: status.code,
      reason: status.reason,
      receivable: linkedReceivable
        ? {
            id: linkedReceivable.id,
            dueDate: formatBusinessDate(linkedReceivable.dueDate),
            status: linkedReceivable.status,
            amount: linkedReceivable.amount.toFixed(2),
            purpose: linkedReceivable.purpose,
          }
        : null,
    };
  }

  private countStatuses(items: Array<{ code: CycleIssueCode }>) {
    const counts: Record<CycleIssueCode, number> = {
      OK: 0,
      MISSING_RECEIVABLE: 0,
      RECEIVABLE_DIVERGENT: 0,
      RECEIVABLE_PAID: 0,
      RECEIVABLE_CANCELED: 0,
      REFERENCE_NOT_BILLABLE: 0,
    };

    for (const item of items) {
      counts[item.code] += 1;
    }

    return counts;
  }

  private isUniqueConstraint(error: unknown) {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
}
