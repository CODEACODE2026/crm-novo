import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import {
  assertAllowedOrigin,
  createOriginProtectionMiddleware,
  isSchedulerDisabled,
  isSchedulerEnabled,
  parseBooleanFlag,
  validateKiragoWebhookToken,
} from './security';

describe('security config helpers', () => {
  it.each([
    [undefined, undefined],
    ['', undefined],
    ['true', true],
    ['TRUE', null],
    ['false', false],
    ['FALSE', null],
    ['0', null],
    ['enabled', null],
  ])('parses boolean flag %s', (value, expected) => {
    expect(parseBooleanFlag(value)).toBe(expected);
  });

  it('treats only explicit true as scheduler enabled', () => {
    expect(isSchedulerEnabled('true')).toBe(true);
    expect(isSchedulerDisabled(undefined)).toBe(true);
    expect(isSchedulerDisabled('false')).toBe(true);
    expect(isSchedulerDisabled('TRUE')).toBe(true);
    expect(isSchedulerDisabled('0')).toBe(true);
  });

  it('validates allowed origins', () => {
    expect(() =>
      assertAllowedOrigin('https://crm.example.com', ['https://crm.example.com']),
    ).not.toThrow();
    expect(() =>
      assertAllowedOrigin('https://evil.example.com', ['https://crm.example.com']),
    ).toThrow(ForbiddenException);
  });

  it('protects mutating cookie-authenticated browser requests by origin', () => {
    const middleware = createOriginProtectionMiddleware(['https://crm.example.com']);
    const next = vi.fn();

    middleware(
      {
        method: 'POST',
        path: '/clients',
        cookies: { crm_novo_auth: 'token' },
        headers: { origin: 'https://evil.example.com' },
      } as never,
      {} as never,
      next,
    );

    expect(next.mock.calls[0]?.[0]).toBeInstanceOf(ForbiddenException);
  });

  it('does not apply origin protection to public webhooks', () => {
    const middleware = createOriginProtectionMiddleware(['https://crm.example.com']);
    const next = vi.fn();

    middleware(
      {
        method: 'POST',
        path: '/whatsapp/webhook/kirago',
        cookies: {},
        headers: { origin: 'https://kirago.example.com' },
      } as never,
      {} as never,
      next,
    );

    expect(next).toHaveBeenCalledWith();
  });

  it('validates Kirago webhook token with exact match', () => {
    expect(() => validateKiragoWebhookToken('secret-token', 'secret-token')).not.toThrow();
    expect(() => validateKiragoWebhookToken('bad-token', 'secret-token')).toThrow(
      ForbiddenException,
    );
  });
});
