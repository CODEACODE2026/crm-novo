import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { WhatsAppQuickReply } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateWhatsAppQuickReplyDto } from './dto/create-whatsapp-quick-reply.dto';
import { UpdateWhatsAppQuickReplyDto } from './dto/update-whatsapp-quick-reply.dto';

@Injectable()
export class WhatsAppQuickRepliesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listAdmin() {
    const replies = await this.prisma.whatsAppQuickReply.findMany({
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }, { id: 'asc' }],
    });

    return replies.map((reply) => this.presentAdmin(reply));
  }

  async listActiveForInbox() {
    const replies = await this.prisma.whatsAppQuickReply.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }, { id: 'asc' }],
      select: { id: true, label: true, text: true },
    });

    return replies;
  }

  async create(dto: CreateWhatsAppQuickReplyDto) {
    this.assertText(dto.label, 'Titulo da resposta rapida e obrigatorio.');
    this.assertText(dto.text, 'Mensagem da resposta rapida e obrigatoria.');

    const created = await this.prisma.whatsAppQuickReply.create({
      data: {
        label: dto.label.trim(),
        text: dto.text.trim(),
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
      },
    });

    return this.presentAdmin(created);
  }

  async update(id: string, dto: UpdateWhatsAppQuickReplyDto) {
    const current = await this.prisma.whatsAppQuickReply.findUnique({ where: { id } });

    if (!current) {
      throw new NotFoundException('Resposta rapida nao encontrada.');
    }

    if (dto.label !== undefined)
      this.assertText(dto.label, 'Titulo da resposta rapida e obrigatorio.');
    if (dto.text !== undefined)
      this.assertText(dto.text, 'Mensagem da resposta rapida e obrigatoria.');

    const updated = await this.prisma.whatsAppQuickReply.update({
      where: { id },
      data: {
        ...(dto.label !== undefined ? { label: dto.label.trim() } : {}),
        ...(dto.text !== undefined ? { text: dto.text.trim() } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      },
    });

    return this.presentAdmin(updated);
  }

  private assertText(value: string, message: string) {
    if (!value.trim()) {
      throw new BadRequestException(message);
    }
  }

  private presentAdmin(reply: WhatsAppQuickReply) {
    return {
      id: reply.id,
      label: reply.label,
      text: reply.text,
      isActive: reply.isActive,
      sortOrder: reply.sortOrder,
      createdAt: reply.createdAt.toISOString(),
      updatedAt: reply.updatedAt.toISOString(),
    };
  }
}
