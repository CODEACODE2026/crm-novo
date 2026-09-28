import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { AdminGuard } from './admin.guard';

function contextWithUser(user: unknown) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  };
}

describe('AdminGuard', () => {
  it('allows ADMIN users', () => {
    const guard = new AdminGuard();

    expect(guard.canActivate(contextWithUser({ id: 'user-id', role: 'ADMIN' }) as never)).toBe(
      true,
    );
  });

  it('rejects missing or non-admin users', () => {
    const guard = new AdminGuard();

    expect(() =>
      guard.canActivate(contextWithUser({ id: 'user-id', role: 'VIEWER' }) as never),
    ).toThrow(ForbiddenException);
    expect(() => guard.canActivate(contextWithUser(undefined) as never)).toThrow(
      ForbiddenException,
    );
  });
});
