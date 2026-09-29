import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { BillingModule } from './billing/billing.module';
import { ClientsModule } from './clients/clients.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { FinanceModule } from './finance/finance.module';
import { HealthModule } from './health/health.module';
import { LegacyImportModule } from './legacy-import/legacy-import.module';
import { PlansModule } from './plans/plans.module';
import { RecoveryModule } from './recovery/recovery.module';
import { ReferralsModule } from './referrals/referrals.module';
import { ReportsModule } from './reports/reports.module';
import { RenewalsModule } from './renewals/renewals.module';
import { UsersModule } from './users/users.module';
import { WhatsAppModule } from './whatsapp/whatsapp.module';
import { validateEnv } from './config/env.validation';
import { rateLimitThrottlers } from './config/rate-limit';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ThrottlerModule.forRoot(rateLimitThrottlers),
    PrismaModule,
    UsersModule,
    AuthModule,
    PlansModule,
    ClientsModule,
    RenewalsModule,
    FinanceModule,
    DashboardModule,
    WhatsAppModule,
    BillingModule,
    RecoveryModule,
    ReferralsModule,
    ReportsModule,
    LegacyImportModule,
    HealthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
