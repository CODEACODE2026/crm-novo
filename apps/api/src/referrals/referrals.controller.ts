import { Body, Controller, Get, Inject, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ApplyReferralRewardDto } from './dto/apply-referral-reward.dto';
import { CancelReferralDto } from './dto/cancel-referral.dto';
import { ListReferralsDto } from './dto/list-referrals.dto';
import { ReferralsService } from './referrals.service';

type AuthenticatedRequest = Request & { user: AuthenticatedUser };

@UseGuards(JwtAuthGuard)
@Controller('referrals')
export class ReferralsController {
  constructor(@Inject(ReferralsService) private readonly referralsService: ReferralsService) {}

  @Get()
  list(@Query() query: ListReferralsDto) {
    return this.referralsService.list(query);
  }

  @Get('summary')
  summary(@Query() query: ListReferralsDto) {
    return this.referralsService.summary(query);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.referralsService.get(id);
  }

  @Post(':id/apply-reward')
  applyReward(
    @Param('id') id: string,
    @Body() dto: ApplyReferralRewardDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.referralsService.applyReward(id, dto, request.user.id);
  }

  @Post(':id/cancel')
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelReferralDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.referralsService.cancel(id, dto, request.user.id);
  }
}
