import { describe, expect, it } from 'vitest';
import type { Response } from 'express';
import { AuthService } from './auth.service';

describe('AuthService cookie policy', () => {
  it('uses HttpOnly cookies and only enables Secure in production', () => {
    const cookies: unknown[] = [];
    const response = {
      cookie: (_name: string, _value: string, options: unknown) => cookies.push(options),
    } as unknown as Response;

    const service = new AuthService(
      {} as never,
      {} as never,
      { get: () => 'production' } as never,
    );

    service.setAuthCookie(response, 'token');

    expect(cookies).toEqual([
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
      }),
    ]);
  });
});
