import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { BillingModule } from './billing/billing.module';
import { ClientsModule } from './clients/clients.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { FinanceModule } from './finance/finance.module';
import { HealthModule } from './health/health.module';
import { PlansModule } from './plans/plans.module';
import { RenewalsModule } from './renewals/renewals.module';
import { UsersModule } from './users/users.module';
import { WhatsAppModule } from './whatsapp/whatsapp.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
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
    HealthModule,
  ],
})
export class AppModule {}
