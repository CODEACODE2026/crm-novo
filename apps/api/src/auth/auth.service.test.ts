import { describe, expect, it } from 'vitest';
import type { Response } from 'express';
import { AuthService } from './auth.service';

describe('AuthService cookie policy', () => {
  it('uses a cross-site compatible HttpOnly cookie in production', () => {
    const cookies: unknown[] = [];
    const response = {
      cookie: (_name: string, _value: string, options: unknown) => cookies.push(options),
    } as unknown as Response;

    const service = new AuthService({} as never, {} as never, { get: () => 'production' } as never);

    service.setAuthCookie(response, 'token');

    expect(cookies).toEqual([
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        path: '/',
      }),
    ]);
  });

  it('uses a local-friendly HttpOnly cookie outside production', () => {
    const cookies: unknown[] = [];
    const response = {
      cookie: (_name: string, _value: string, options: unknown) => cookies.push(options),
    } as unknown as Response;

    const service = new AuthService(
      {} as never,
      {} as never,
      { get: () => 'development' } as never,
    );

    service.setAuthCookie(response, 'token');

    expect(cookies).toEqual([
      expect.objectContaining({
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        path: '/',
      }),
    ]);
  });

  it('clears the production cookie with matching cross-site attributes', () => {
    const clearCookies: unknown[] = [];
    const response = {
      clearCookie: (_name: string, options: unknown) => clearCookies.push(options),
    } as unknown as Response;

    const service = new AuthService({} as never, {} as never, { get: () => 'production' } as never);

    service.clearAuthCookie(response);

    expect(clearCookies).toEqual([
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        path: '/',
      }),
    ]);
  });
});
