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
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { CancelReceivableDto } from './dto/cancel-receivable.dto';
import { CreateFinancialCategoryDto } from './dto/create-financial-category.dto';
import { CreateManualTransactionDto } from './dto/create-manual-transaction.dto';
import { FinancialSummaryDto } from './dto/financial-summary.dto';
import { ListFinancialTransactionsDto } from './dto/list-financial-transactions.dto';
import { ListReceivablesDto } from './dto/list-receivables.dto';
import { PayReceivableDto } from './dto/pay-receivable.dto';
import { UpdateFinancialCategoryDto } from './dto/update-financial-category.dto';
import { UpdateManualTransactionDto } from './dto/update-manual-transaction.dto';
import { FinanceService } from './finance.service';

type AuthenticatedRequest = Request & { user: AuthenticatedUser };

@UseGuards(JwtAuthGuard)
@Controller()
export class FinanceController {
  constructor(@Inject(FinanceService) private readonly financeService: FinanceService) {}

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
}
