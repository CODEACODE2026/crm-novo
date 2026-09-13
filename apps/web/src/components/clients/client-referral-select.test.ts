import { describe, expect, it, vi } from 'vitest';
import {
  CLIENT_REFERRAL_SEARCH_DEBOUNCE_MS,
  ensureSelectedOption,
  formatNormalizedBrazilPhone,
  resolveReferralSelection,
  scheduleClientReferralSearch,
} from './client-referral-select';
import type { ClientOption } from '../../lib/crm-api';

const bruno: ClientOption = {
  id: 'client-1',
  name: 'Bruno Silva',
  reference: 'bruno1499',
  phoneNormalized: '5544998212815',
};

describe('ClientReferralSelect helpers', () => {
  it('formats selected client phone for display', () => {
    expect(formatNormalizedBrazilPhone(bruno.phoneNormalized)).toBe('(44) 99821-2815');
  });

  it('keeps the selected client visible across option refreshes', () => {
    expect(ensureSelectedOption([], bruno, bruno.id)).toEqual([bruno]);
    expect(ensureSelectedOption([bruno], bruno, bruno.id)).toEqual([bruno]);
  });

  it('resolves selecting, clearing, and sem indicacao state', () => {
    expect(resolveReferralSelection(bruno)).toMatchObject({
      selected: bruno,
      value: bruno.id,
      search: '',
      options: [],
      open: false,
    });
    expect(resolveReferralSelection(null)).toMatchObject({
      selected: null,
      value: '',
      search: '',
      options: [],
      open: false,
    });
  });

  it('debounces searches and supports empty result callbacks', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<() => Promise<ClientOption[]>>().mockResolvedValue([]);
    const onSuccess = vi.fn();
    const onDone = vi.fn();

    scheduleClientReferralSearch('bruno', fetcher, onSuccess, onDone);

    expect(fetcher).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(CLIENT_REFERRAL_SEARCH_DEBOUNCE_MS - 1);
    expect(fetcher).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(fetcher).toHaveBeenCalledWith('bruno');
    expect(onSuccess).toHaveBeenCalledWith([]);
    expect(onDone).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });
});
