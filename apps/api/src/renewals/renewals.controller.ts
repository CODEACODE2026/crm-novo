import { Body, Controller, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { CreateRenewalDto } from './dto/create-renewal.dto';
import { RenewalPreviewDto } from './dto/renewal-preview.dto';
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

  @Post()
  create(
    @Param('clientReferenceId') clientReferenceId: string,
    @Body() dto: CreateRenewalDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.renewalsService.createForReference(clientReferenceId, dto, request.user.id);
  }
}
