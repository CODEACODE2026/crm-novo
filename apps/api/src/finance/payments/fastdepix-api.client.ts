import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  HttpException,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  fastDepixObservedCreateRejectionStatuses,
  normalizeFastDepixProviderTransactionId,
  type FastDepixCreateOutcome,
  type FastDepixCreateRequest,
} from './fastdepix-create-contract';

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
  paid_at?: string;
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

  createTransaction(token: string, payload: FastDepixCreateRequest) {
    return this.request<FastDepixTransactionResponse>('/transactions', token, {
      method: 'POST',
      body: payload,
    });
  }

  /**
   * Future automatic-billing boundary. Manual PIX keeps using createTransaction.
   * Once fetch is invoked, transport failures are deliberately ambiguous because
   * this provider contract exposes neither an idempotency key nor lookup by an
   * external creation reference.
   */
  async createTransactionClassified(
    token: string,
    payload: FastDepixCreateRequest,
  ): Promise<FastDepixCreateOutcome> {
    try {
      this.assertCreateRequestCanBeDispatched(token, payload);
    } catch (error) {
      return {
        kind: 'PRE_CALL_FAILURE',
        requestDispatched: false,
        remoteEffect: 'ABSENT_PROVEN',
        automaticRetryEligible: true,
        code: 'FASTDEPIX_PRE_CALL_VALIDATION_FAILED',
        message: this.contractErrorMessage(error),
      };
    }

    try {
      const response = await this.createTransaction(token, payload);
      const providerTransactionId = normalizeFastDepixProviderTransactionId(response.id);

      if (!providerTransactionId) {
        return {
          kind: 'REMOTE_RESULT_UNCERTAIN',
          requestDispatched: true,
          remoteEffect: 'UNKNOWN',
          automaticRetryEligible: false,
          providerTransactionId: null,
          code: 'FASTDEPIX_SUCCESS_WITHOUT_TRANSACTION_ID',
          message: 'FastDepix respondeu sem identificador remoto; retry automatico bloqueado.',
          httpStatus: 200,
        };
      }

      return {
        kind: 'CONFIRMED',
        requestDispatched: true,
        remoteEffect: 'CONFIRMED',
        automaticRetryEligible: false,
        providerTransactionId,
        response,
      };
    } catch (error) {
      const providerStatus = this.providerHttpStatus(error);
      const status = error instanceof HttpException ? error.getStatus() : null;
      if (providerStatus !== null && fastDepixObservedCreateRejectionStatuses.has(providerStatus)) {
        return {
          kind: 'HTTP_REJECTION_OBSERVED',
          requestDispatched: true,
          remoteEffect: 'UNKNOWN',
          automaticRetryEligible: false,
          httpStatus: providerStatus,
          code: `FASTDEPIX_REJECTED_${providerStatus}`,
          message: this.contractErrorMessage(error),
        };
      }

      return {
        kind: 'REMOTE_RESULT_UNCERTAIN',
        requestDispatched: true,
        remoteEffect: 'UNKNOWN',
        automaticRetryEligible: false,
        providerTransactionId: null,
        code:
          providerStatus === null
            ? 'FASTDEPIX_TRANSPORT_UNCERTAIN'
            : `FASTDEPIX_HTTP_${providerStatus}_UNCERTAIN`,
        message: 'Resultado remoto da criacao PIX incerto; retry automatico bloqueado.',
        httpStatus: providerStatus ?? status,
      };
    }
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

  private assertCreateRequestCanBeDispatched(token: string, payload: FastDepixCreateRequest) {
    if (!token.trim()) throw new Error('Credencial FastDepix ausente.');
    this.baseUrl();
    JSON.stringify(payload);
  }

  private contractErrorMessage(error: unknown) {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      if (typeof response === 'string') return response;
      if (response && typeof response === 'object' && 'message' in response) {
        const message = response.message;
        if (typeof message === 'string') return message;
      }
    }
    return error instanceof Error ? error.message : 'Falha FastDepix sem detalhes seguros.';
  }

  private providerHttpStatus(error: unknown) {
    if (!error || typeof error !== 'object' || !('providerHttpStatus' in error)) return null;
    const value = error.providerHttpStatus;
    return typeof value === 'number' ? value : null;
  }

  private toHttpError(status: number, payload: unknown) {
    const message = this.safeErrorMessage(status, payload);

    if (status === 401 || status === 403) {
      return this.withProviderStatus(
        new BadGatewayException('Credencial do provider invalida ou nao autorizada.'),
        status,
      );
    }

    if (status === 404) {
      return this.withProviderStatus(
        new NotFoundException('Transacao de pagamento nao encontrada no provider.'),
        status,
      );
    }

    if (status === 409) {
      return this.withProviderStatus(
        new ConflictException('Provider de pagamentos recusou a operacao no status atual.'),
        status,
      );
    }

    if (status === 429) {
      return this.withProviderStatus(
        new HttpException(
          'Limite da API de pagamentos atingido. Tente novamente em instantes.',
          HttpStatus.TOO_MANY_REQUESTS,
        ),
        status,
      );
    }

    if (status >= 500) {
      return this.withProviderStatus(
        new BadGatewayException('Provider de pagamentos retornou erro temporario.'),
        status,
      );
    }

    return this.withProviderStatus(new BadRequestException(message), status);
  }

  private withProviderStatus<T extends HttpException>(error: T, providerHttpStatus: number) {
    return Object.assign(error, { providerHttpStatus });
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
