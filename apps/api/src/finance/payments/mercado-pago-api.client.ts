import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type MercadoPagoPaymentMethod = {
  id?: string;
  type?: string;
  ticket_url?: string;
  qr_code?: string;
  qr_code_base64?: string;
};

export type MercadoPagoOrderPayment = {
  id?: string;
  reference_id?: string;
  status?: string;
  status_detail?: string;
  amount?: string;
  paid_amount?: string;
  expiration_time?: string;
  date_approved?: string;
  payment_method?: MercadoPagoPaymentMethod;
};

export type MercadoPagoOrderResponse = {
  id?: string;
  live_mode?: boolean;
  type?: string;
  total_amount?: string;
  total_paid_amount?: string;
  country_code?: string;
  currency?: string;
  currency_id?: string;
  external_reference?: string;
  status?: string;
  status_detail?: string;
  created_date?: string;
  last_updated_date?: string;
  integration_data?: {
    application_id?: string | number;
  };
  transactions?: {
    payments?: MercadoPagoOrderPayment[];
  };
};

export type MercadoPagoCreateOrderPayload = {
  type: 'online';
  total_amount: string;
  external_reference: string;
  processing_mode: 'automatic';
  transactions: {
    payments: [
      {
        amount: string;
        payment_method: { id: 'pix'; type: 'bank_transfer' };
        expiration_time: string;
      },
    ];
  };
  payer: { email: string; first_name?: 'APRO' };
};

export type MercadoPagoUserResponse = {
  id?: number | string;
  nickname?: string;
  site_id?: string;
  email?: string;
  tags?: unknown[];
  test_data?: unknown;
  user_type?: string;
};

@Injectable()
export class MercadoPagoApiClient {
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  createOrder(token: string, idempotencyKey: string, payload: MercadoPagoCreateOrderPayload) {
    return this.request<MercadoPagoOrderResponse>('/v1/orders', token, {
      method: 'POST',
      body: payload,
      idempotencyKey,
    });
  }

  getOrder(token: string, orderId: string) {
    return this.request<MercadoPagoOrderResponse>(
      `/v1/orders/${encodeURIComponent(orderId)}`,
      token,
    );
  }

  getCurrentUser(token: string) {
    return this.request<MercadoPagoUserResponse>('/users/me', token, {
      base: 'identity',
    });
  }

  private async request<T>(
    path: string,
    token: string,
    options: {
      method?: string;
      body?: unknown;
      idempotencyKey?: string;
      base?: 'orders' | 'identity';
    } = {},
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs());

    try {
      const response = await fetch(
        new URL(path.replace(/^\//, ''), this.baseUrl(options.base ?? 'orders')).toString(),
        {
          method: options.method ?? 'GET',
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${token}`,
            ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
            ...(options.idempotencyKey ? { 'X-Idempotency-Key': options.idempotencyKey } : {}),
          },
          ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
          signal: controller.signal,
        },
      );
      const payload = (await response.json().catch(() => null)) as T | null;

      if (!response.ok) {
        throw this.toHttpError(response.status, payload);
      }

      if (!payload || typeof payload !== 'object') {
        throw new BadGatewayException('Mercado Pago retornou resposta invalida.');
      }

      return payload;
    } catch (error) {
      if (error instanceof HttpException) throw error;

      if (error instanceof Error && error.name === 'AbortError') {
        throw new ServiceUnavailableException('Tempo limite da API Mercado Pago excedido.');
      }

      throw new ServiceUnavailableException('API Mercado Pago indisponivel no momento.');
    } finally {
      clearTimeout(timeout);
    }
  }

  private timeoutMs() {
    const configured = Number(this.config.get<string>('MERCADO_PAGO_HTTP_TIMEOUT_MS') ?? '8000');
    return Number.isFinite(configured) && configured >= 1000 ? configured : 8000;
  }

  private baseUrl(base: 'orders' | 'identity') {
    const key =
      base === 'identity' ? 'MERCADO_PAGO_IDENTITY_BASE_URL' : 'MERCADO_PAGO_API_BASE_URL';
    const fallback =
      base === 'identity' ? 'https://api.mercadolibre.com/' : 'https://api.mercadopago.com/';
    const url = new URL(this.config.get<string>(key)?.trim() || fallback);

    if (url.protocol !== 'https:' && this.config.get<string>('NODE_ENV') === 'production') {
      throw new ServiceUnavailableException(`${key} deve usar HTTPS em producao.`);
    }

    return url.toString().endsWith('/') ? url.toString() : `${url.toString()}/`;
  }

  private toHttpError(status: number, payload: unknown) {
    if (status === 401 || status === 403) {
      return new BadGatewayException('Credencial Mercado Pago invalida ou nao autorizada.');
    }

    if (status === 404) {
      return new NotFoundException('Order Mercado Pago nao encontrada.');
    }

    if (status === 409) {
      return new ConflictException('Mercado Pago recusou a operacao no status atual.');
    }

    if (status === 429) {
      return new HttpException(
        'Limite da API Mercado Pago atingido. Tente novamente em instantes.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (status >= 500) {
      return new BadGatewayException('Mercado Pago retornou erro temporario.');
    }

    return new BadRequestException(this.safeErrorMessage(payload));
  }

  private safeErrorMessage(payload: unknown) {
    if (
      payload &&
      typeof payload === 'object' &&
      'message' in payload &&
      typeof payload.message === 'string'
    ) {
      return `Mercado Pago rejeitou a requisicao: ${payload.message.slice(0, 140)}`;
    }

    return 'Mercado Pago rejeitou os dados da cobranca.';
  }
}
