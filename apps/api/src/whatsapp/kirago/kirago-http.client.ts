import { Inject, Injectable } from '@nestjs/common';
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
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

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

      const method = requestInit.method ?? 'GET';
      const response = await fetch(new URL(path, baseUrl).toString(), requestInit);

      const responseText = await response.text().catch(() => '');
      const payload = this.parseJson<T>(responseText);

      if (!response.ok) {
        const code =
          response.status === 401 || response.status === 403
            ? options.authFailureCode
            : response.status === 404
              ? 'KIRAGO_RESOURCE_NOT_FOUND'
              : response.status === 429
                ? 'KIRAGO_RATE_LIMITED'
                : 'WHATSAPP_PROVIDER_ERROR';
        const safeBody = this.safeResponseBody(responseText);
        throw new KiragoProviderError(
          code,
          this.safeHttpMessage(code, response.status, safeBody),
          response.status,
          {
            method,
            path,
            status: response.status,
            ...(safeBody ? { responseBody: safeBody } : {}),
          },
        );
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
    if (code === 'KIRAGO_RESOURCE_NOT_FOUND') return 'Recurso Kirago nao encontrado.';
    return 'Falha ao comunicar com a Kirago.';
  }

  private safeHttpMessage(code: KiragoErrorCode, status: number, safeBody: string) {
    return `${this.safeMessage(code)} HTTP ${status}${safeBody ? `: ${safeBody}` : ''}`.slice(
      0,
      240,
    );
  }

  private parseJson<T>(text: string) {
    if (!text) {
      return null;
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      return null;
    }
  }

  private safeResponseBody(text: string) {
    const parsed = this.parseJson<unknown>(text);
    const body = parsed ? JSON.stringify(this.redactSensitiveValues(parsed)) : text;

    return body
      .replace(/authorization\s*[:=]\s*bearer\s+[^\s"',;}]+/gi, 'Authorization: [redacted]')
      .replace(/(token|secret|api[_-]?key)\s*[:=]\s*["']?[^"',;}\s]+/gi, '$1=[redacted]')
      .replace(/([?&](?:token|secret|api[_-]?key)=)[^&\s"']+/gi, '$1[redacted]')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 180);
  }

  private redactSensitiveValues(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.redactSensitiveValues(item));
    }

    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          /authorization|token|secret|api[_-]?key/i.test(key)
            ? '[redacted]'
            : this.redactSensitiveValues(item),
        ]),
      );
    }

    return value;
  }
}
