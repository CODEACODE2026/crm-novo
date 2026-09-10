import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  findActiveByEmail(email: string) {
    return this.prisma.user.findFirst({
      where: { email: email.trim().toLowerCase(), active: true },
    });
  }

  findActiveById(id: string) {
    return this.prisma.user.findFirst({
      where: { id, active: true },
      select: { id: true, name: true, email: true, role: true },
    });
  }
}
