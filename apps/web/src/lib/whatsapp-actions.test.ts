import { describe, expect, it } from 'vitest';
import {
  canStartWhatsAppAction,
  extractWebhookUrl,
  maskProviderUserId,
  nextWhatsAppActionsMenuOpen,
  normalizeWhatsAppDisplayPhone,
} from './whatsapp-actions';

describe('WhatsApp actions helpers', () => {
  it('toggles and closes the actions menu for outside, escape and select events', () => {
    expect(nextWhatsAppActionsMenuOpen(false, 'toggle')).toBe(true);
    expect(nextWhatsAppActionsMenuOpen(true, 'toggle')).toBe(false);
    expect(nextWhatsAppActionsMenuOpen(true, 'outside')).toBe(false);
    expect(nextWhatsAppActionsMenuOpen(true, 'escape')).toBe(false);
    expect(nextWhatsAppActionsMenuOpen(true, 'select')).toBe(false);
  });

  it('prevents concurrent WhatsApp actions while one operation is running', () => {
    expect(canStartWhatsAppAction('')).toBe(true);
    expect(canStartWhatsAppAction(null)).toBe(true);
    expect(canStartWhatsAppAction('disconnect')).toBe(false);
    expect(canStartWhatsAppAction('webhook-info')).toBe(false);
  });

  it('formats WhatsApp JIDs with device suffix without leaking the raw suffix', () => {
    expect(normalizeWhatsAppDisplayPhone('554498212815:67')).toBe('(44) 9821-2815');
    expect(normalizeWhatsAppDisplayPhone('5544998212815@s.whatsapp.net')).toBe('(44) 99821-2815');
  });

  it('masks provider user ids for diagnostics', () => {
    expect(maskProviderUserId('kirago-user-123456')).toBe('kira...3456');
    expect(maskProviderUserId(null)).toBe('-');
  });

  it('extracts a safe webhook URL from Kirago webhook payload shapes', () => {
    expect(extractWebhookUrl({ data: { WebhookURL: 'https://crm.test/webhook' } })).toBe(
      'https://crm.test/webhook',
    );
    expect(extractWebhookUrl({ webhook: 'https://crm.test/direct' })).toBe(
      'https://crm.test/direct',
    );
  });
});
