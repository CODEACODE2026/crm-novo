import { describe, expect, it } from 'vitest';
import {
  WhatsAppConversationConnectionMismatchError,
  assertWhatsAppMessageConnectionMatchesConversation,
  buildWhatsAppMessageCreateDataForConversation,
} from './whatsapp-conversation-domain';

describe('WhatsApp conversation domain', () => {
  it('allows a message from the same WhatsApp connection as the conversation', () => {
    expect(() =>
      assertWhatsAppMessageConnectionMatchesConversation(
        {
          id: 'conversation-1',
          whatsAppConnectionId: 'connection-1',
        },
        {
          whatsAppConnectionId: 'connection-1',
        },
      ),
    ).not.toThrow();
  });

  it('rejects a message from another WhatsApp connection', () => {
    expect(() =>
      assertWhatsAppMessageConnectionMatchesConversation(
        {
          id: 'conversation-1',
          whatsAppConnectionId: 'connection-1',
        },
        {
          whatsAppConnectionId: 'connection-2',
        },
      ),
    ).toThrow(WhatsAppConversationConnectionMismatchError);
  });

  it('builds message create data from the conversation connection', () => {
    expect(
      buildWhatsAppMessageCreateDataForConversation(
        {
          id: 'conversation-1',
          whatsAppConnectionId: 'connection-1',
        },
        {
          direction: 'INBOUND',
          status: 'SENT',
          text: 'Oi',
          type: 'TEXT',
        },
      ),
    ).toEqual({
      conversationId: 'conversation-1',
      direction: 'INBOUND',
      status: 'SENT',
      text: 'Oi',
      type: 'TEXT',
      whatsAppConnectionId: 'connection-1',
    });
  });
});
