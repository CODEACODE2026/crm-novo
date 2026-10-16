import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma, type WhatsAppAttendanceStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateWhatsAppAttendanceCategoryDto } from './dto/create-whatsapp-attendance-category.dto';
import { ListWhatsAppAttendancesDto } from './dto/list-whatsapp-attendances.dto';
import { ResolveWhatsAppAttendanceDto } from './dto/resolve-whatsapp-attendance.dto';
import { UpdateWhatsAppAttendanceCategoryDto } from './dto/update-whatsapp-attendance-category.dto';
import { WhatsAppRealtimeService } from './whatsapp-realtime.service';

export const ATTENDANCE_RESOLUTION_GRACE_MINUTES = 15;

const activeAttendanceStatuses: WhatsAppAttendanceStatus[] = ['PENDING', 'IN_PROGRESS'];
const resolutionNoteMaxLength = 4000;
const defaultCategories = [
  ['Suporte técnico', 'BLUE'],
  ['Dúvida / orientação', 'TEAL'],
  ['Novo produto / serviço', 'GREEN'],
  ['Financeiro / cobrança', 'YELLOW'],
  ['Renovação', 'PURPLE'],
  ['Alteração de cadastro', 'GRAY'],
  ['Problema / indisponibilidade', 'RED'],
  ['Configuração', 'ORANGE'],
  ['Cancelamento', 'PINK'],
  ['Comercial', 'GREEN'],
  ['Outro', 'GRAY'],
] as const;

type AttendanceTransaction = Prisma.TransactionClient;

@Injectable()
export class WhatsAppAttendanceService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional()
    @Inject(WhatsAppRealtimeService)
    private readonly realtime?: WhatsAppRealtimeService,
  ) {}

  async ensureDefaultCategories(connectionId: string) {
    await this.requireConnection(connectionId);
    await this.prisma.whatsAppAttendanceCategory.createMany({
      data: defaultCategories.map(([name, color], sortOrder) => ({
        whatsAppConnectionId: connectionId,
        name,
        normalizedName: this.normalizeName(name),
        color,
        sortOrder,
      })),
      skipDuplicates: true,
    });
  }

  async listCategories(connectionId: string, includeInactive = true) {
    await this.ensureDefaultCategories(connectionId);
    return this.prisma.whatsAppAttendanceCategory.findMany({
      where: {
        whatsAppConnectionId: connectionId,
        ...(includeInactive ? {} : { isActive: true }),
      },
      select: {
        id: true,
        whatsAppConnectionId: true,
        name: true,
        color: true,
        isActive: true,
        sortOrder: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { attendances: true } },
      },
      orderBy: [{ sortOrder: 'asc' }, { normalizedName: 'asc' }],
    });
  }

  async createCategory(connectionId: string, dto: CreateWhatsAppAttendanceCategoryDto) {
    await this.requireConnection(connectionId);
    const name = this.displayName(dto.name);
    try {
      return await this.prisma.whatsAppAttendanceCategory.create({
        data: {
          whatsAppConnectionId: connectionId,
          name,
          normalizedName: this.normalizeName(name),
          color: dto.color,
          sortOrder: dto.sortOrder ?? 0,
        },
      });
    } catch (error) {
      this.throwCategoryWriteError(error);
    }
  }

  async updateCategory(
    connectionId: string,
    categoryId: string,
    dto: UpdateWhatsAppAttendanceCategoryDto,
  ) {
    await this.requireCategory(connectionId, categoryId);
    if (Object.values(dto).every((value) => value === undefined)) {
      throw new BadRequestException('Informe ao menos um campo para atualizar a categoria.');
    }
    const name = dto.name === undefined ? undefined : this.displayName(dto.name);
    try {
      return await this.prisma.whatsAppAttendanceCategory.update({
        where: { id: categoryId },
        data: {
          ...(name === undefined ? {} : { name, normalizedName: this.normalizeName(name) }),
          ...(dto.color === undefined ? {} : { color: dto.color }),
          ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }),
          ...(dto.sortOrder === undefined ? {} : { sortOrder: dto.sortOrder }),
        },
      });
    } catch (error) {
      this.throwCategoryWriteError(error);
    }
  }

  async removeCategory(connectionId: string, categoryId: string) {
    await this.requireCategory(connectionId, categoryId);
    const used = await this.prisma.whatsAppAttendance.count({ where: { categoryId } });
    if (used > 0) {
      const category = await this.prisma.whatsAppAttendanceCategory.update({
        where: { id: categoryId },
        data: { isActive: false },
      });
      return { deleted: false, deactivated: true, category };
    }
    await this.prisma.whatsAppAttendanceCategory.delete({ where: { id: categoryId } });
    return { deleted: true, deactivated: false, id: categoryId };
  }

  async recordInboundMessage(
    tx: AttendanceTransaction,
    input: {
      conversationId: string;
      connectionId: string;
      clientId: string | null;
      messageId: string;
      occurredAt: Date;
    },
  ) {
    await this.lockConversation(tx, input.conversationId);
    const alreadyLinked = await tx.whatsAppMessage.findUnique({
      where: { id: input.messageId },
      select: { attendanceId: true },
    });
    if (alreadyLinked?.attendanceId)
      return { attendanceId: alreadyLinked.attendanceId, created: false };

    const active = await tx.whatsAppAttendance.findFirst({
      where: { conversationId: input.conversationId, status: { in: activeAttendanceStatuses } },
      orderBy: { openedAt: 'desc' },
    });
    if (active) {
      await this.attachInbound(tx, active.id, input.messageId);
      return { attendanceId: active.id, created: false };
    }

    const lastResolved = await tx.whatsAppAttendance.findFirst({
      where: { conversationId: input.conversationId, status: 'RESOLVED' },
      orderBy: { resolvedAt: 'desc' },
    });
    const graceStart = new Date(
      input.occurredAt.getTime() - ATTENDANCE_RESOLUTION_GRACE_MINUTES * 60_000,
    );
    if (lastResolved?.resolvedAt && lastResolved.resolvedAt > graceStart) {
      await this.attachInbound(tx, lastResolved.id, input.messageId);
      return { attendanceId: lastResolved.id, created: false, grace: true };
    }

    const attendance = await tx.whatsAppAttendance.create({
      data: {
        conversationId: input.conversationId,
        whatsAppConnectionId: input.connectionId,
        clientId: input.clientId,
        openedAt: input.occurredAt,
        openedByMessageId: input.messageId,
      },
    });
    await tx.whatsAppMessage.update({
      where: { id: input.messageId },
      data: { attendanceId: attendance.id },
    });
    return { attendanceId: attendance.id, created: true };
  }

  async recordManualOutboundMessage(
    tx: AttendanceTransaction,
    input: { conversationId: string; messageId: string; occurredAt: Date },
  ) {
    await this.lockConversation(tx, input.conversationId);
    const linked = await tx.whatsAppMessage.findUnique({
      where: { id: input.messageId },
      select: { attendanceId: true },
    });
    if (linked?.attendanceId) return linked.attendanceId;

    const active = await tx.whatsAppAttendance.findFirst({
      where: { conversationId: input.conversationId, status: { in: activeAttendanceStatuses } },
      orderBy: { openedAt: 'desc' },
    });
    if (!active) return null;

    await tx.whatsAppAttendance.update({
      where: { id: active.id },
      data: {
        outboundMessagesCount: { increment: 1 },
        ...(active.status === 'PENDING'
          ? {
              status: 'IN_PROGRESS',
              firstAgentReplyAt: active.firstAgentReplyAt ?? input.occurredAt,
            }
          : {}),
      },
    });
    await tx.whatsAppMessage.update({
      where: { id: input.messageId },
      data: { attendanceId: active.id },
    });
    return active.id;
  }

  async getActiveAttendance(conversationId: string) {
    await this.requireConversation(conversationId);
    const attendance = await this.prisma.whatsAppAttendance.findFirst({
      where: { conversationId, status: { in: activeAttendanceStatuses } },
      include: this.detailInclude(),
      orderBy: { openedAt: 'desc' },
    });
    return attendance ? this.present(attendance) : null;
  }

  async listConversationAttendances(conversationId: string, query: ListWhatsAppAttendancesDto) {
    await this.requireConversation(conversationId);
    return this.listHistory({ conversationId }, query);
  }

  async listClientAttendances(clientId: string, query: ListWhatsAppAttendancesDto) {
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true },
    });
    if (!client) throw new NotFoundException('Cliente nao encontrado.');
    return this.listHistory({ clientId }, query);
  }

  async getAttendance(id: string) {
    const attendance = await this.prisma.whatsAppAttendance.findUnique({
      where: { id },
      include: this.detailInclude(),
    });
    if (!attendance) throw new NotFoundException('Atendimento WhatsApp nao encontrado.');
    return this.present(attendance);
  }

  async resolveActiveAttendance(
    conversationId: string,
    actorUserId: string,
    dto: ResolveWhatsAppAttendanceDto,
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      await this.lockConversation(tx, conversationId);
      const conversation = await tx.whatsAppConversation.findUnique({
        where: { id: conversationId },
      });
      if (!conversation) throw new NotFoundException('Conversa WhatsApp nao encontrada.');
      const attendance = await tx.whatsAppAttendance.findFirst({
        where: { conversationId, status: { in: activeAttendanceStatuses } },
        orderBy: { openedAt: 'desc' },
      });
      if (!attendance) {
        const legacy = await tx.whatsAppConversation.update({
          where: { id: conversationId },
          data: { status: 'RESOLVED' },
        });
        return {
          attendance: null,
          conversation: legacy,
          repeated: conversation.status === 'RESOLVED',
        };
      }
      if (!dto.categoryId) {
        throw new BadRequestException('Categoria obrigatoria para resolver o atendimento.');
      }
      const category = await tx.whatsAppAttendanceCategory.findFirst({
        where: {
          id: dto.categoryId,
          whatsAppConnectionId: conversation.whatsAppConnectionId,
          isActive: true,
        },
      });
      if (!category)
        throw new BadRequestException('Categoria invalida, inativa ou de outra conexao.');
      const note = dto.resolutionNote?.trim() || null;
      if (note && note.length > resolutionNoteMaxLength) {
        throw new BadRequestException(
          `Observacao deve ter no maximo ${resolutionNoteMaxLength} caracteres.`,
        );
      }
      const resolvedAt = new Date();
      const resolved = await tx.whatsAppAttendance.update({
        where: { id: attendance.id },
        data: {
          status: 'RESOLVED',
          resolvedAt,
          categoryId: category.id,
          resolutionNote: note,
          resolvedByUserId: actorUserId,
        },
      });
      const updatedConversation = await tx.whatsAppConversation.update({
        where: { id: conversationId },
        data: { status: 'RESOLVED' },
      });
      return { attendance: resolved, conversation: updatedConversation, repeated: false };
    });
    this.realtime?.emitConversationUpdated(conversationId);
    return result;
  }

  private async attachInbound(tx: AttendanceTransaction, attendanceId: string, messageId: string) {
    await tx.whatsAppAttendance.update({
      where: { id: attendanceId },
      data: { inboundMessagesCount: { increment: 1 } },
    });
    await tx.whatsAppMessage.update({ where: { id: messageId }, data: { attendanceId } });
  }

  private async listHistory(
    where: { conversationId?: string; clientId?: string },
    query: ListWhatsAppAttendancesDto,
  ) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 10, 100);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.whatsAppAttendance.findMany({
        where,
        include: this.detailInclude(),
        orderBy: [{ openedAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.whatsAppAttendance.count({ where }),
    ]);
    const totalPages = Math.ceil(total / limit);
    return {
      items: items.map((item) => this.present(item)),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasMore: page < totalPages,
        nextPage: page < totalPages ? page + 1 : null,
      },
    };
  }

  private detailInclude() {
    return {
      category: { select: { id: true, name: true, color: true } },
      resolvedBy: { select: { id: true, name: true } },
      conversation: { select: { id: true, phone: true, contactName: true } },
    } satisfies Prisma.WhatsAppAttendanceInclude;
  }

  private present(
    attendance: Prisma.WhatsAppAttendanceGetPayload<{
      include: ReturnType<WhatsAppAttendanceService['detailInclude']>;
    }>,
  ) {
    return {
      id: attendance.id,
      conversationId: attendance.conversationId,
      whatsAppConnectionId: attendance.whatsAppConnectionId,
      clientId: attendance.clientId,
      status: attendance.status,
      openedAt: attendance.openedAt,
      firstAgentReplyAt: attendance.firstAgentReplyAt,
      resolvedAt: attendance.resolvedAt,
      category: attendance.category,
      resolutionNote: attendance.resolutionNote,
      resolvedBy: attendance.resolvedBy,
      inboundMessagesCount: attendance.inboundMessagesCount,
      outboundMessagesCount: attendance.outboundMessagesCount,
      createdAt: attendance.createdAt,
      updatedAt: attendance.updatedAt,
    };
  }

  private async lockConversation(tx: AttendanceTransaction, conversationId: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${conversationId}))`;
  }

  private async requireConnection(id: string) {
    const connection = await this.prisma.whatsAppConnection.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!connection) throw new NotFoundException('Conexao WhatsApp nao encontrada.');
    return connection;
  }

  private async requireConversation(id: string) {
    const conversation = await this.prisma.whatsAppConversation.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!conversation) throw new NotFoundException('Conversa WhatsApp nao encontrada.');
    return conversation;
  }

  private async requireCategory(connectionId: string, categoryId: string) {
    const category = await this.prisma.whatsAppAttendanceCategory.findFirst({
      where: { id: categoryId, whatsAppConnectionId: connectionId },
    });
    if (!category) throw new NotFoundException('Categoria de atendimento nao encontrada.');
    return category;
  }

  private displayName(value: string) {
    const name = value.normalize('NFKC').trim().replace(/\s+/g, ' ');
    if (!name) throw new BadRequestException('Nome da categoria obrigatorio.');
    return name;
  }

  private normalizeName(value: string) {
    return this.displayName(value).toLocaleLowerCase('pt-BR');
  }

  private throwCategoryWriteError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('Ja existe uma categoria com este nome nesta conexao.');
    }
    throw error;
  }
}
