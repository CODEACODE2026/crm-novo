export type WhatsAppActionsMenuEvent = 'toggle' | 'outside' | 'escape' | 'select';

export function nextWhatsAppActionsMenuOpen(current: boolean, event: WhatsAppActionsMenuEvent) {
  if (event === 'toggle') return !current;
  return false;
}

export function canStartWhatsAppAction(workingAction: string | null | undefined) {
  return !workingAction;
}

export function normalizeWhatsAppDisplayPhone(value: string | null | undefined) {
  if (!value) return null;

  const withoutDomain = value.split('@')[0] ?? value;
  const withoutDeviceSuffix = withoutDomain.replace(/:\d+$/, '');
  const digits = withoutDeviceSuffix.replace(/\D/g, '');

  if (!digits) return null;

  const national = digits.startsWith('55') && digits.length > 4 ? digits.slice(2) : digits;

  if (national.length === 10 || national.length === 11) {
    const area = national.slice(0, 2);
    const number = national.slice(2);
    const splitAt = number.length === 9 ? 5 : 4;
    return `(${area}) ${number.slice(0, splitAt)}-${number.slice(splitAt)}`;
  }

  return digits;
}

export function maskProviderUserId(value: string | null | undefined) {
  if (!value) return '-';
  if (value.length <= 8) return `${value.slice(0, 2)}...`;
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export function extractWebhookUrl(payload: unknown) {
  if (!payload || typeof payload !== 'object') return null;

  const data =
    'data' in payload && payload.data && typeof payload.data === 'object' ? payload.data : payload;

  if (!data || typeof data !== 'object') return null;

  const record = data as Record<string, unknown>;

  for (const key of ['webhook', 'webhookurl', 'WebhookURL', 'url']) {
    if (typeof record[key] === 'string') {
      return record[key];
    }
  }

  return null;
}
