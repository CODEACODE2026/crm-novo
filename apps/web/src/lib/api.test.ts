import { describe, expect, it } from 'vitest';
import { buildApiUrl } from './api';

describe('buildApiUrl', () => {
  it('normalizes paths with a leading slash', () => {
    expect(buildApiUrl('health')).toBe('http://localhost:3001/health');
  });

  it('keeps paths that already start with slash', () => {
    expect(buildApiUrl('/auth/me')).toBe('http://localhost:3001/auth/me');
  });
});
