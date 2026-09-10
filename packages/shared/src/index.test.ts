import { describe, expect, it } from 'vitest';
import { APP_TIMEZONE, USER_ROLE_ADMIN } from './index';

describe('shared contracts', () => {
  it('keeps the operational timezone explicit', () => {
    expect(APP_TIMEZONE).toBe('America/Sao_Paulo');
  });

  it('exposes the initial admin role', () => {
    expect(USER_ROLE_ADMIN).toBe('ADMIN');
  });
});
