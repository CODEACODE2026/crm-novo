import { GUARDS_METADATA } from '@nestjs/common/constants';
import { describe, expect, it, vi } from 'vitest';
import { AdminGuard } from '../auth/admin.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ReportsController } from './reports.controller';

describe('ReportsController intelligence contract', () => {
  it('keeps intelligence and legacy reports behind JWT and admin authorization', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, ReportsController)).toEqual([
      JwtAuthGuard,
      AdminGuard,
    ]);
  });

  it('forwards intelligence filters without changing legacy report methods', async () => {
    const intelligence = {
      overview: vi.fn().mockResolvedValue({ meta: {} }),
      finance: vi.fn().mockResolvedValue({ kpis: {} }),
      clients: vi.fn().mockResolvedValue({ charts: {} }),
    };
    const controller = new ReportsController({} as never, intelligence as never);
    const query = { preset: 'last_7_days' as const };
    await expect(controller.overview(query)).resolves.toEqual({ meta: {} });
    await expect(controller.financeIntelligence(query)).resolves.toEqual({ kpis: {} });
    await expect(controller.clientsIntelligence(query)).resolves.toEqual({ charts: {} });
    expect(intelligence.overview).toHaveBeenCalledWith(query);
    expect(intelligence.finance).toHaveBeenCalledWith(query);
    expect(intelligence.clients).toHaveBeenCalledWith(query);
  });
});
