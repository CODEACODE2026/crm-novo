import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanActiveDto } from './dto/update-plan-active.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';

@Injectable()
export class PlansService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list() {
    const plans = await this.prisma.plan.findMany({
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    });

    return plans.map((plan) => ({
      ...plan,
      defaultValue: plan.defaultValue.toString(),
    }));
  }

  async get(id: string) {
    const plan = await this.prisma.plan.findUnique({ where: { id } });

    if (!plan) {
      throw new NotFoundException('Plano nao encontrado.');
    }

    return {
      ...plan,
      defaultValue: plan.defaultValue.toString(),
    };
  }

  async create(dto: CreatePlanDto) {
    try {
      const plan = await this.prisma.plan.create({
        data: {
          name: dto.name.trim(),
          durationMonths: dto.durationMonths,
          defaultValue: dto.defaultValue,
          active: dto.active ?? true,
        },
      });

      return {
        ...plan,
        defaultValue: plan.defaultValue.toString(),
      };
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async update(id: string, dto: UpdatePlanDto) {
    await this.ensureExists(id);

    try {
      const plan = await this.prisma.plan.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.durationMonths !== undefined ? { durationMonths: dto.durationMonths } : {}),
          ...(dto.defaultValue !== undefined ? { defaultValue: dto.defaultValue } : {}),
          ...(dto.active !== undefined ? { active: dto.active } : {}),
        },
      });

      return {
        ...plan,
        defaultValue: plan.defaultValue.toString(),
      };
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async updateActive(id: string, dto: UpdatePlanActiveDto) {
    await this.ensureExists(id);

    const plan = await this.prisma.plan.update({
      where: { id },
      data: { active: dto.active },
    });

    return {
      ...plan,
      defaultValue: plan.defaultValue.toString(),
    };
  }

  async remove(id: string) {
    await this.ensureExists(id);

    const linkedClients = await this.prisma.client.count({ where: { planId: id } });

    if (linkedClients > 0) {
      const plan = await this.prisma.plan.update({
        where: { id },
        data: { active: false },
      });

      return {
        ...plan,
        defaultValue: plan.defaultValue.toString(),
      };
    }

    const plan = await this.prisma.plan.delete({ where: { id } });

    return {
      ...plan,
      defaultValue: plan.defaultValue.toString(),
    };
  }

  async ensureActivePlan(id: string) {
    const plan = await this.prisma.plan.findFirst({
      where: { id, active: true },
    });

    if (!plan) {
      throw new NotFoundException('Plano ativo nao encontrado.');
    }

    return plan;
  }

  private async ensureExists(id: string) {
    const exists = await this.prisma.plan.count({ where: { id } });

    if (!exists) {
      throw new NotFoundException('Plano nao encontrado.');
    }
  }

  private handlePrismaError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('Ja existe um plano com este nome.');
    }

    throw error;
  }
}
