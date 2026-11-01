import { describe, expect, it } from 'vitest';
import { normalizeOptionalEmailInput, resolveClientEmailUpdate } from './client-email';

describe('client optional email form contract', () => {
  it('trims a filled email', () => {
    expect(normalizeOptionalEmailInput('  maria@example.com  ')).toBe('maria@example.com');
  });

  it.each(['', '   '])('normalizes %j to null', (email) => {
    expect(normalizeOptionalEmailInput(email)).toBeNull();
  });

  it('returns undefined when the email did not change', () => {
    expect(resolveClientEmailUpdate('maria@example.com', ' maria@example.com ')).toBeUndefined();
    expect(resolveClientEmailUpdate(null, '   ')).toBeUndefined();
  });

  it('returns null when the user erases an existing email', () => {
    expect(resolveClientEmailUpdate('maria@example.com', '')).toBeNull();
  });

  it('returns the normalized email when the user updates it', () => {
    expect(resolveClientEmailUpdate('old@example.com', ' new@example.com ')).toBe(
      'new@example.com',
    );
  });
});
