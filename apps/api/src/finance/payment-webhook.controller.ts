import { Body, Controller, Headers, Param, Post, Req } from '@nestjs/common';
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
    @Headers('x-webhook-signature') signature: string | undefined,
    @Req() request: RawBodyRequest,
    @Body() payload: unknown,
  ) {
    const providerCode = provider.toUpperCase() as PaymentProviderCode;

    return this.financeService.processPaymentWebhook(
      providerCode,
      signature,
      request.rawBody,
      payload,
    );
  }
}
