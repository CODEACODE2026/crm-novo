import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KiragoProviderError } from './kirago-provider.error';
import { KiragoHttpClient } from './kirago-http.client';

export type KiragoCreateUserPayload = {
  name: string;
  token: string;
  webhook?: string;
  events?: string;
};

export type KiragoUserResponse = {
  code?: number;
  data?: {
    id?: string;
    name?: string;
    webhook?: string;
    events?: string;
    connected?: boolean;
    loggedIn?: boolean;
    jid?: string;
    phone?: string;
  };
  success?: boolean;
};

@Injectable()
export class KiragoAdminClient {
  constructor(
    private readonly config: ConfigService,
    private readonly http: KiragoHttpClient,
  ) {}

  createUser(payload: KiragoCreateUserPayload) {
    return this.http.request<KiragoUserResponse>('/admin/users', {
      method: 'POST',
      headers: { Authorization: this.adminToken() },
      body: payload,
      authFailureCode: 'KIRAGO_ADMIN_AUTH_FAILED',
    });
  }

  listUsers() {
    return this.http.request<KiragoUserResponse>('/admin/users', {
      headers: { Authorization: this.adminToken() },
      authFailureCode: 'KIRAGO_ADMIN_AUTH_FAILED',
    });
  }

  getUser(id: string) {
    return this.http.request<KiragoUserResponse>(`/admin/users/${encodeURIComponent(id)}`, {
      headers: { Authorization: this.adminToken() },
      authFailureCode: 'KIRAGO_ADMIN_AUTH_FAILED',
    });
  }

  private adminToken() {
    const token = this.config.get<string>('KIRAGO_ADMIN_TOKEN');

    if (!token) {
      throw new KiragoProviderError(
        'KIRAGO_ADMIN_AUTH_FAILED',
        'Token admin Kirago nao configurado.',
      );
    }

    return token;
  }
}
