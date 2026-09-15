import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { PaymentProviderCode } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { CancelReceivableDto } from './dto/cancel-receivable.dto';
import { CreateFinancialCategoryDto } from './dto/create-financial-category.dto';
import { CreateManualTransactionDto } from './dto/create-manual-transaction.dto';
import { CreateReceivablesPixDto } from './dto/create-receivables-pix.dto';
import { FinancialSummaryDto } from './dto/financial-summary.dto';
import { ListFinancialTransactionsDto } from './dto/list-financial-transactions.dto';
import { ListReceivablesDto } from './dto/list-receivables.dto';
import { PayReceivableDto } from './dto/pay-receivable.dto';
import { PayReceivablesDto } from './dto/pay-receivables.dto';
import {
  SavePaymentProviderCredentialDto,
  SavePaymentWebhookSecretDto,
} from './dto/save-payment-provider-credential.dto';
import { UpdateFinancialCategoryDto } from './dto/update-financial-category.dto';
import { UpdateManualTransactionDto } from './dto/update-manual-transaction.dto';
import { FinanceService } from './finance.service';
import { PaymentProviderCredentialsService } from './payments/payment-provider-credentials.service';

type AuthenticatedRequest = Request & { user: AuthenticatedUser };

@UseGuards(JwtAuthGuard)
@Controller()
export class FinanceController {
  constructor(
    @Inject(FinanceService) private readonly financeService: FinanceService,
    @Inject(PaymentProviderCredentialsService)
    private readonly paymentCredentials: PaymentProviderCredentialsService,
  ) {}

  @Get('financial-categories')
  listCategories() {
    return this.financeService.listCategories();
  }

  @Get('financial-categories/:id')
  getCategory(@Param('id') id: string) {
    return this.financeService.getCategory(id);
  }

  @Post('financial-categories')
  createCategory(@Body() dto: CreateFinancialCategoryDto) {
    return this.financeService.createCategory(dto);
  }

  @Patch('financial-categories/:id')
  updateCategory(@Param('id') id: string, @Body() dto: UpdateFinancialCategoryDto) {
    return this.financeService.updateCategory(id, dto);
  }

  @Delete('financial-categories/:id')
  removeCategory(@Param('id') id: string) {
    return this.financeService.removeCategory(id);
  }

  @Get('receivables')
  listReceivables(@Query() query: ListReceivablesDto) {
    return this.financeService.listReceivables(query);
  }

  @Get('receivables/:id')
  getReceivable(@Param('id') id: string) {
    return this.financeService.getReceivable(id);
  }

  @Post('receivables/:id/payment')
  payReceivable(
    @Param('id') id: string,
    @Body() dto: PayReceivableDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.financeService.payReceivable(id, dto, request.user.id);
  }

  @Post('receivables/payments')
  payReceivables(@Body() dto: PayReceivablesDto, @Req() request: AuthenticatedRequest) {
    return this.financeService.payReceivables(dto, request.user.id);
  }

  @Post('receivables/:id/pix')
  createReceivablePix(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.financeService.createReceivablePix(id, request.user.id);
  }

  @Post('receivables/pix')
  createReceivablesPix(@Body() dto: CreateReceivablesPixDto, @Req() request: AuthenticatedRequest) {
    return this.financeService.createReceivablesPix(dto, request.user.id);
  }

  @Get('receivables/:id/payment-intents')
  listPaymentIntents(@Param('id') id: string) {
    return this.financeService.listPaymentIntents(id);
  }

  @Post('payment-intents/:id/sync')
  syncPaymentIntent(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.financeService.syncPaymentIntent(id, request.user.id);
  }

  @Post('payment-intents/:id/mock-confirm')
  confirmMockPaymentIntent(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.financeService.confirmMockPaymentIntent(id, request.user.id);
  }

  @Post('payment-intents/:id/cancel')
  cancelPaymentIntent(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.financeService.cancelPaymentIntent(id, request.user.id);
  }

  @Post('receivables/:id/cancel')
  cancelReceivable(
    @Param('id') id: string,
    @Body() dto: CancelReceivableDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.financeService.cancelReceivable(id, dto, request.user.id);
  }

  @Get('financial-transactions')
  listTransactions(@Query() query: ListFinancialTransactionsDto) {
    return this.financeService.listTransactions(query);
  }

  @Get('financial-transactions/:id')
  getTransaction(@Param('id') id: string) {
    return this.financeService.getTransaction(id);
  }

  @Post('financial-transactions/entries')
  createEntry(@Body() dto: CreateManualTransactionDto, @Req() request: AuthenticatedRequest) {
    return this.financeService.createManualEntry(dto, request.user.id);
  }

  @Post('financial-transactions/expenses')
  createExpense(@Body() dto: CreateManualTransactionDto, @Req() request: AuthenticatedRequest) {
    return this.financeService.createManualExpense(dto, request.user.id);
  }

  @Patch('financial-transactions/:id')
  updateTransaction(@Param('id') id: string, @Body() dto: UpdateManualTransactionDto) {
    return this.financeService.updateManualTransaction(id, dto);
  }

  @Delete('financial-transactions/:id')
  removeTransaction(@Param('id') id: string) {
    return this.financeService.removeManualTransaction(id);
  }

  @Get('finance/summary')
  summary(@Query() query: FinancialSummaryDto) {
    return this.financeService.summary(query);
  }

  @Get('payment-provider-credentials')
  listPaymentProviderCredentials() {
    return this.paymentCredentials.list();
  }

  @Post('payment-provider-credentials')
  savePaymentProviderCredential(@Body() dto: SavePaymentProviderCredentialDto) {
    return this.paymentCredentials.save(dto);
  }

  @Post('payment-provider-credentials/:provider/test')
  testPaymentProviderCredential(@Param('provider') provider: PaymentProviderCode) {
    return this.paymentCredentials.test(provider);
  }

  @Post('payment-provider-credentials/:provider/deactivate')
  deactivatePaymentProviderCredential(@Param('provider') provider: PaymentProviderCode) {
    return this.paymentCredentials.deactivate(provider);
  }

  @Post('payment-provider-credentials/:provider/default')
  setDefaultPaymentProvider(@Param('provider') provider: PaymentProviderCode) {
    return this.paymentCredentials.setDefaultProvider(provider);
  }

  @Post('payment-provider-credentials/:provider/webhook-secret')
  savePaymentWebhookSecret(
    @Param('provider') provider: PaymentProviderCode,
    @Body() dto: SavePaymentWebhookSecretDto,
  ) {
    return this.paymentCredentials.saveWebhookSecret(provider, dto);
  }

  @Post('payment-provider-credentials/:provider/webhook/register')
  registerPaymentWebhook(@Param('provider') provider: PaymentProviderCode) {
    return this.paymentCredentials.registerWebhook(provider);
  }
}
