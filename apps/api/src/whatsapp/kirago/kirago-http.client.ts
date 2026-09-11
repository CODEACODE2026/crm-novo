import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KiragoProviderError, type KiragoErrorCode } from './kirago-provider.error';

type KiragoRequestOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  authFailureCode: KiragoErrorCode;
};

@Injectable()
export class KiragoHttpClient {
  constructor(private readonly config: ConfigService) {}

  async request<T>(path: string, options: KiragoRequestOptions): Promise<T> {
    const baseUrl = this.config.get<string>('KIRAGO_BASE_URL');

    if (!baseUrl) {
      throw new KiragoProviderError('KIRAGO_UNAVAILABLE', 'API Kirago nao configurada.');
    }

    const timeoutMs = Number(this.config.get<string>('KIRAGO_HTTP_TIMEOUT_MS') ?? '8000');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const requestInit: RequestInit = {
        method: options.method ?? 'GET',
        headers: {
          Accept: 'application/json',
          ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(options.headers ?? {}),
        },
        signal: controller.signal,
      };

      if (options.body !== undefined) {
        requestInit.body = JSON.stringify(options.body);
      }

      const response = await fetch(new URL(path, baseUrl).toString(), requestInit);

      const payload = (await response.json().catch(() => null)) as T | null;

      if (!response.ok) {
        const code = response.status === 401 ? options.authFailureCode : 'WHATSAPP_PROVIDER_ERROR';
        throw new KiragoProviderError(code, this.safeMessage(code), response.status);
      }

      return payload as T;
    } catch (error) {
      if (error instanceof KiragoProviderError) {
        throw error;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw new KiragoProviderError('KIRAGO_TIMEOUT', 'Tempo limite da Kirago excedido.');
      }

      throw new KiragoProviderError('KIRAGO_UNAVAILABLE', 'Kirago indisponivel no momento.');
    } finally {
      clearTimeout(timeout);
    }
  }

  private safeMessage(code: KiragoErrorCode) {
    if (code === 'KIRAGO_ADMIN_AUTH_FAILED') return 'Falha de autenticacao admin na Kirago.';
    if (code === 'KIRAGO_INSTANCE_AUTH_FAILED') return 'Falha de autenticacao da instancia Kirago.';
    return 'Falha ao comunicar com a Kirago.';
  }
}
