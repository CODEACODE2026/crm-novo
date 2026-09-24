import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from './authenticated-user';
import { JwtAuthGuard } from './jwt-auth.guard';

function createContext(token?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        cookies: token ? { crm_novo_auth: token } : {},
      }),
    }),
  } as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  const user: AuthenticatedUser = {
    id: 'user-id',
    name: 'Admin',
    email: 'admin@example.com',
    role: 'ADMIN',
  };

  it('authenticates a valid JWT cookie', async () => {
    const auth = { validateToken: vi.fn().mockResolvedValue(user) };
    const guard = new JwtAuthGuard(auth as never);
    const context = createContext('valid-token');

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(auth.validateToken).toHaveBeenCalledWith('valid-token');
  });

  it('rejects an expired JWT as controlled 401', async () => {
    const error = Object.assign(new Error('jwt expired'), { name: 'TokenExpiredError' });
    const auth = {
      validateToken: vi.fn().mockRejectedValue(error),
    };
    const guard = new JwtAuthGuard(auth as never);

    await expect(guard.canActivate(createContext('expired-token'))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects an invalid JWT as controlled 401', async () => {
    const error = Object.assign(new Error('invalid token'), { name: 'JsonWebTokenError' });
    const auth = {
      validateToken: vi.fn().mockRejectedValue(error),
    };
    const guard = new JwtAuthGuard(auth as never);

    await expect(guard.canActivate(createContext('invalid-token'))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a missing JWT as controlled 401', async () => {
    const auth = { validateToken: vi.fn() };
    const guard = new JwtAuthGuard(auth as never);

    await expect(guard.canActivate(createContext())).rejects.toBeInstanceOf(UnauthorizedException);
    expect(auth.validateToken).not.toHaveBeenCalled();
  });

  it('rejects an inactive JWT user lookup as controlled 401', async () => {
    const auth = { validateToken: vi.fn().mockResolvedValue(null) };
    const guard = new JwtAuthGuard(auth as never);

    await expect(guard.canActivate(createContext('inactive-token'))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('does not mask unexpected validation failures as invalid tokens', async () => {
    const error = new Error('database unavailable');
    const auth = { validateToken: vi.fn().mockRejectedValue(error) };
    const guard = new JwtAuthGuard(auth as never);

    await expect(guard.canActivate(createContext('valid-looking-token'))).rejects.toBe(error);
  });
});
