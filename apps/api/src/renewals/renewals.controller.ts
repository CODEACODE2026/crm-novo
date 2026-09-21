import { Body, Controller, Get, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { CreateRenewalDto } from './dto/create-renewal.dto';
import { RenewalPreviewDto } from './dto/renewal-preview.dto';
import { RevertRenewalDto } from './dto/revert-renewal.dto';
import { RenewalsService } from './renewals.service';

type AuthenticatedRequest = Request & { user: AuthenticatedUser };

@UseGuards(JwtAuthGuard)
@Controller('clients/:clientId/renewals')
export class RenewalsController {
  constructor(@Inject(RenewalsService) private readonly renewalsService: RenewalsService) {}

  @Post('preview')
  preview(@Param('clientId') clientId: string, @Body() dto: RenewalPreviewDto) {
    return this.renewalsService.preview(clientId, dto);
  }

  @Post()
  create(
    @Param('clientId') clientId: string,
    @Body() dto: CreateRenewalDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.renewalsService.create(clientId, dto, request.user.id);
  }
}

@UseGuards(JwtAuthGuard)
@Controller('client-references/:clientReferenceId/renewals')
export class ClientReferenceRenewalsController {
  constructor(@Inject(RenewalsService) private readonly renewalsService: RenewalsService) {}

  @Post('preview')
  preview(@Param('clientReferenceId') clientReferenceId: string, @Body() dto: RenewalPreviewDto) {
    return this.renewalsService.previewReference(clientReferenceId, dto);
  }

  @Get(':renewalId/revert/preview')
  previewRevert(
    @Param('clientReferenceId') clientReferenceId: string,
    @Param('renewalId') renewalId: string,
  ) {
    return this.renewalsService.previewRevert(clientReferenceId, renewalId);
  }

  @Post(':renewalId/revert')
  revert(
    @Param('clientReferenceId') clientReferenceId: string,
    @Param('renewalId') renewalId: string,
    @Body() dto: RevertRenewalDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.renewalsService.revert(clientReferenceId, renewalId, dto, request.user.id);
  }

  @Post()
  create(
    @Param('clientReferenceId') clientReferenceId: string,
    @Body() dto: CreateRenewalDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.renewalsService.createForReference(clientReferenceId, dto, request.user.id);
  }
}
