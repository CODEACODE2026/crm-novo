import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  formatWaitingDuration,
  getHumanWaitingSeconds,
  getWaitingPriority,
  subscribeToWaitingClock,
  WAITING_CLOCK_INTERVAL_MS,
} from './attendance-waiting';

describe('visual human-waiting priority', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    [0, '<1 min'],
    [59, '<1 min'],
    [60, '1 min'],
    [15 * 60, '15 min'],
    [15 * 60 + 1, '15 min'],
    [30 * 60, '30 min'],
    [30 * 60 + 1, '30 min'],
    [60 * 60, '1h'],
    [60 * 60 + 1, '1h'],
    [60 * 60 + 8 * 60, '1h 08m'],
    [24 * 60 * 60, '1d 0h'],
    [27 * 60 * 60, '1d 3h'],
  ])('formats %i seconds as %s', (seconds, expected) => {
    expect(formatWaitingDuration(seconds)).toBe(expected);
  });

  it.each([
    [0, 'NORMAL'],
    [15 * 60, 'NORMAL'],
    [15 * 60 + 1, 'ATTENTION'],
    [30 * 60, 'ATTENTION'],
    [30 * 60 + 1, 'HIGH'],
    [60 * 60, 'HIGH'],
    [60 * 60 + 1, 'CRITICAL'],
    [24 * 60 * 60, 'CRITICAL'],
  ] as const)('classifies %i seconds as %s', (seconds, expected) => {
    expect(getWaitingPriority(seconds)).toBe(expected);
  });

  it('derives human waiting from openedAt and never from another timestamp', () => {
    expect(
      getHumanWaitingSeconds('2026-10-16T10:00:00.000Z', Date.parse('2026-10-16T10:40:00.000Z')),
    ).toBe(40 * 60);
    expect(getHumanWaitingSeconds('invalid', Date.now())).toBe(0);
    expect(
      getHumanWaitingSeconds('2026-10-16T10:00:00.000Z', Date.parse('2026-10-16T09:59:00.000Z')),
    ).toBe(0);
  });

  it('does not reset human waiting when an auto-reply is sent later', () => {
    const openedAt = '2026-10-16T10:00:00.000Z';
    const autoReplySentAt = '2026-10-16T10:01:00.000Z';
    const nowMs = Date.parse('2026-10-16T10:20:00.000Z');

    expect(autoReplySentAt).not.toBe(openedAt);
    expect(getHumanWaitingSeconds(openedAt, nowMs)).toBe(20 * 60);
  });

  it('uses one 60-second interval and cleans it up', () => {
    vi.useFakeTimers();
    const onTick = vi.fn();
    const cleanup = subscribeToWaitingClock(onTick);

    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(WAITING_CLOCK_INTERVAL_MS);
    expect(onTick).toHaveBeenCalledTimes(1);

    cleanup();
    expect(vi.getTimerCount()).toBe(0);
  });
});
