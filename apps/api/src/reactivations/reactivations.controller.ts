import { Body, Controller, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AdminGuard } from '../auth/admin.guard';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateReferenceReactivationDto } from './dto/create-reference-reactivation.dto';
import { ReactivationsService } from './reactivations.service';

type AuthenticatedRequest = Request & { user: AuthenticatedUser };

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('client-references/:clientReferenceId/reactivations')
export class ReactivationsController {
  constructor(
    @Inject(ReactivationsService) private readonly reactivationsService: ReactivationsService,
  ) {}

  @Post()
  create(
    @Param('clientReferenceId') clientReferenceId: string,
    @Body() dto: CreateReferenceReactivationDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.reactivationsService.createForReference(clientReferenceId, dto, request.user.id);
  }
}
