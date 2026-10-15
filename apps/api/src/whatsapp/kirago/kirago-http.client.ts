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
        const providerDetails = this.safeProviderResponseDetails(responseText, options);
        const safeBody = this.safeResponseBody(providerDetails);
        throw new KiragoProviderError(
          code,
          this.safeHttpMessage(code, response.status, safeBody),
          response.status,
          {
            method,
            path,
            status: response.status,
            ...providerDetails,
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

  private safeResponseBody(details: {
    providerCode?: string;
    providerMessage?: string;
    providerDetails?: string;
  }) {
    const body = JSON.stringify({
      ...(details.providerCode ? { code: details.providerCode } : {}),
      ...(details.providerMessage ? { message: details.providerMessage } : {}),
      ...(details.providerDetails ? { Details: details.providerDetails } : {}),
    });

    return body === '{}'
      ? ''
      : body
          .replace(/authorization\s*[:=]\s*bearer\s+[^\s"',;}]+/gi, 'Authorization: [redacted]')
          .replace(/(token|secret|api[_-]?key)\s*[:=]\s*["']?[^"',;}\s]+/gi, '$1=[redacted]')
          .replace(/([?&](?:token|secret|api[_-]?key)=)[^&\s"']+/gi, '$1[redacted]')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 180);
  }

  private safeProviderResponseDetails(text: string, options: KiragoRequestOptions) {
    const parsed = this.parseJson<unknown>(text);
    const record = this.recordValue(parsed);
    const data = this.recordValue(record?.data);
    const providerError = this.recordValue(record?.error);

    const providerCode = this.safeProviderText(this.scalarValue(record?.code), options);
    const providerMessage = this.safeProviderText(
      this.stringValue(record?.message) ??
        this.stringValue(record?.error) ??
        this.stringValue(providerError?.message) ??
        this.stringValue(data?.message) ??
        this.stringValue(data?.error) ??
        (!record ? text : undefined),
      options,
    );
    const providerDetails = this.safeProviderText(
      this.stringValue(record?.Details) ??
        this.stringValue(record?.details) ??
        this.stringValue(providerError?.Details) ??
        this.stringValue(providerError?.details) ??
        this.stringValue(data?.Details) ??
        this.stringValue(data?.details),
      options,
    );

    return {
      ...(providerCode ? { providerCode } : {}),
      ...(providerMessage ? { providerMessage } : {}),
      ...(providerDetails ? { providerDetails } : {}),
    };
  }

  private safeProviderText(value: string | undefined, options: KiragoRequestOptions) {
    if (!value) return undefined;

    const secrets = [
      ...Object.values(options.headers ?? {}),
      ...this.requestSensitiveValues(options.body),
    ].filter((item) => item.length >= 3);
    let sanitized = value;

    for (const secret of secrets) {
      sanitized = sanitized.replace(new RegExp(this.escapeRegExp(secret), 'gi'), '[redacted]');
    }

    sanitized = sanitized
      .replace(/authorization\s*[:=]\s*bearer\s+[^\s"',;}]+/gi, 'Authorization: [redacted]')
      .replace(/(token|secret|api[_-]?key)\s*[:=]\s*["']?[^"',;}\s]+/gi, '$1=[redacted]')
      .replace(/\b\d{7,15}\b/g, '[redacted-phone]');
    sanitized = this.stripControlCharacters(sanitized).replace(/\s+/g, ' ').trim().slice(0, 160);

    return sanitized || undefined;
  }

  private requestSensitiveValues(body: unknown) {
    const record = this.recordValue(body);
    if (!record) return [];

    return Object.entries(record)
      .filter(([key, value]) => /^(phone|body|id)$/i.test(key) && typeof value === 'string')
      .map(([, value]) => value as string);
  }

  private recordValue(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    return value as Record<string, unknown>;
  }

  private stringValue(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private scalarValue(value: unknown) {
    if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 80);
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return undefined;
  }

  private escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private stripControlCharacters(value: string) {
    return Array.from(value, (character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || (code >= 127 && code <= 159) ? ' ' : character;
    }).join('');
  }
}
