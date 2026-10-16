'use client';

import { useEffect, useState } from 'react';

export const WAITING_PRIORITY_THRESHOLDS_SECONDS = {
  attention: 15 * 60,
  high: 30 * 60,
  critical: 60 * 60,
} as const;

export const WAITING_CLOCK_INTERVAL_MS = 60_000;

export type WaitingPriority = 'NORMAL' | 'ATTENTION' | 'HIGH' | 'CRITICAL';

export const waitingPriorityLabels: Record<WaitingPriority, string> = {
  NORMAL: 'Aguardando',
  ATTENTION: 'Atenção',
  HIGH: 'Alta espera',
  CRITICAL: 'Espera crítica',
};

export function getHumanWaitingSeconds(openedAt: string, nowMs = Date.now()) {
  const openedAtMs = new Date(openedAt).getTime();
  if (!Number.isFinite(openedAtMs)) return 0;
  return Math.max(0, Math.floor((nowMs - openedAtMs) / 1000));
}

export function getWaitingPriority(waitingSeconds: number): WaitingPriority {
  const seconds = Math.max(0, Math.floor(waitingSeconds || 0));
  if (seconds <= WAITING_PRIORITY_THRESHOLDS_SECONDS.attention) return 'NORMAL';
  if (seconds <= WAITING_PRIORITY_THRESHOLDS_SECONDS.high) return 'ATTENTION';
  if (seconds <= WAITING_PRIORITY_THRESHOLDS_SECONDS.critical) return 'HIGH';
  return 'CRITICAL';
}

export function formatWaitingDuration(waitingSeconds: number) {
  const seconds = Math.max(0, Math.floor(waitingSeconds || 0));
  if (seconds < 60) return '<1 min';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) {
    return remainingMinutes
      ? `${hours}h ${String(remainingMinutes).padStart(2, '0')}m`
      : `${hours}h`;
  }

  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

export function subscribeToWaitingClock(onTick: () => void) {
  const intervalId = globalThis.setInterval(onTick, WAITING_CLOCK_INTERVAL_MS);
  return () => globalThis.clearInterval(intervalId);
}

export function useWaitingClock() {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => subscribeToWaitingClock(() => setNowMs(Date.now())), []);

  return nowMs;
}
