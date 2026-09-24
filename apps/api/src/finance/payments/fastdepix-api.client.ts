import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
  HttpException,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type FastDepixAuthMe = {
  api_provider?: string;
  provider_label?: string;
  parceiro?: {
    id?: string;
    name?: string;
    email?: string;
  };
};

export type FastDepixTransactionResponse = {
  id?: number | string;
  amount?: number | string;
  depix_transaction_id?: string;
  blockchain_tx_id?: string | null;
  end_to_end_id?: string | null;
  status?: string;
  qr_code?: string;
  qr_code_text?: string;
  qr_code_expires_at?: string;
  created_at?: string;
  payer_phone?: string;
};

export type FastDepixWebhookRegistrationResponse = {
  id?: number | string;
  url?: string;
  events?: string[];
  secret_key?: string;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
};

type FastDepixEnvelope<T> = {
  data?: T;
  message?: string;
  errors?: unknown;
};

@Injectable()
export class FastDepixApiClient {
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  authMe(token: string) {
    return this.request<FastDepixAuthMe>('/auth/me', token);
  }

  createTransaction(
    token: string,
    payload: {
      amount: number;
      user: { name: string };
      payer_phone: string;
      notification_url?: string;
    },
  ) {
    return this.request<FastDepixTransactionResponse>('/transactions', token, {
      method: 'POST',
      body: payload,
    });
  }

  getTransaction(token: string, id: string) {
    return this.request<FastDepixTransactionResponse>(
      `/transactions/${encodeURIComponent(id)}`,
      token,
    );
  }

  cancelTransaction(token: string, id: string) {
    return this.request<FastDepixTransactionResponse>(
      `/transactions/${encodeURIComponent(id)}`,
      token,
      {
        method: 'DELETE',
      },
    );
  }

  registerWebhook(token: string, payload: { url: string; events: string[] }) {
    return this.request<FastDepixWebhookRegistrationResponse>('/webhooks/register', token, {
      method: 'POST',
      body: payload,
    });
  }

  listWebhooks(token: string) {
    return this.request<FastDepixWebhookRegistrationResponse[]>('/webhooks', token);
  }

  private async request<T>(
    path: string,
    token: string,
    options: { method?: string; body?: unknown } = {},
  ): Promise<T> {
    const timeoutMs = Number(
      this.config.get<string>('PAYMENT_PROVIDER_HTTP_TIMEOUT_MS') ??
        this.config.get<string>('FASTDEPIX_HTTP_TIMEOUT_MS') ??
        '8000',
    );
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(new URL(path.replace(/^\//, ''), this.baseUrl()).toString(), {
        method: options.method ?? 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
          ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
        signal: controller.signal,
      });
      const payload = (await response.json().catch(() => null)) as FastDepixEnvelope<T> | T | null;

      if (!response.ok) {
        throw this.toHttpError(response.status, payload);
      }

      if (payload && typeof payload === 'object' && 'data' in payload) {
        return (payload.data ?? {}) as T;
      }

      return payload as T;
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof UnauthorizedException ||
        error instanceof NotFoundException ||
        error instanceof HttpException ||
        error instanceof BadGatewayException
      ) {
        throw error;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw new ServiceUnavailableException('Tempo limite da API de pagamentos excedido.');
      }

      throw new ServiceUnavailableException('API de pagamentos indisponivel no momento.');
    } finally {
      clearTimeout(timeout);
    }
  }

  private baseUrl() {
    const configured =
      this.config.get<string>('FASTDEPIX_BASE_URL') ?? 'https://fastdepix.space/api/v1/';
    const url = new URL(configured);

    if (url.protocol !== 'https:' && this.config.get<string>('NODE_ENV') === 'production') {
      throw new ServiceUnavailableException('FASTDEPIX_BASE_URL deve usar HTTPS em producao.');
    }

    return url.toString().endsWith('/') ? url.toString() : `${url.toString()}/`;
  }

  private toHttpError(status: number, payload: unknown) {
    const message = this.safeErrorMessage(status, payload);

    if (status === 401 || status === 403) {
      return new UnauthorizedException('Chave API de pagamentos invalida ou nao autorizada.');
    }

    if (status === 404) {
      return new NotFoundException('Transacao de pagamento nao encontrada no provider.');
    }

    if (status === 429) {
      return new HttpException(
        'Limite da API de pagamentos atingido. Tente novamente em instantes.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (status >= 500) {
      return new BadGatewayException('Provider de pagamentos retornou erro temporario.');
    }

    return new BadRequestException(message);
  }

  private safeErrorMessage(status: number, payload: unknown) {
    if (status === 422 && payload && typeof payload === 'object' && 'errors' in payload) {
      return 'Dados rejeitados pela API de pagamentos.';
    }

    if (
      payload &&
      typeof payload === 'object' &&
      'message' in payload &&
      typeof payload.message === 'string'
    ) {
      return payload.message.slice(0, 180);
    }

    return 'Falha ao comunicar com a API de pagamentos.';
  }
}
