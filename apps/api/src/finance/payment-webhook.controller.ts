import { Body, Controller, Headers, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { PaymentProviderCode } from '@prisma/client';
import { FinanceService } from './finance.service';

type RawBodyRequest = Request & { rawBody?: Buffer };

@Controller('payment-webhooks')
export class PaymentWebhookController {
  constructor(private readonly financeService: FinanceService) {}

  @Post(':provider')
  processWebhook(
    @Param('provider') provider: PaymentProviderCode,
    @Headers('x-webhook-signature') legacySignature: string | undefined,
    @Headers('x-signature') mercadoPagoSignature: string | undefined,
    @Headers('x-request-id') requestId: string | undefined,
    @Query('data.id') dataId: string | undefined,
    @Query('type') topic: string | undefined,
    @Req() request: RawBodyRequest,
    @Body() payload: unknown,
  ) {
    const providerCode = provider.toUpperCase() as PaymentProviderCode;

    return this.financeService.processPaymentWebhook(
      providerCode,
      providerCode === 'MERCADO_PAGO' ? mercadoPagoSignature : legacySignature,
      request.rawBody,
      payload,
      {
        ...(requestId ? { requestId } : {}),
        ...(dataId ? { dataId } : {}),
        ...(topic ? { topic } : {}),
      },
    );
  }
}
