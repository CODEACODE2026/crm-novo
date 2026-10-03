export type WhatsAppConversationConnectionRef = {
  id: string;
  whatsAppConnectionId: string;
};

export type WhatsAppMessageConnectionRef = {
  whatsAppConnectionId: string;
};

export type WhatsAppMessageConnectionScopedInput = {
  conversationId?: never;
  whatsAppConnectionId?: never;
};

export class WhatsAppConversationConnectionMismatchError extends Error {
  constructor(conversationId: string) {
    super(`Mensagem WhatsApp nao pertence a conexao da conversa ${conversationId}.`);
    this.name = 'WhatsAppConversationConnectionMismatchError';
  }
}

export function assertWhatsAppMessageConnectionMatchesConversation(
  conversation: WhatsAppConversationConnectionRef,
  message: WhatsAppMessageConnectionRef,
) {
  if (message.whatsAppConnectionId !== conversation.whatsAppConnectionId) {
    throw new WhatsAppConversationConnectionMismatchError(conversation.id);
  }
}

export function buildWhatsAppMessageCreateDataForConversation<T extends object>(
  conversation: WhatsAppConversationConnectionRef,
  data: T & WhatsAppMessageConnectionScopedInput,
) {
  return {
    ...data,
    conversationId: conversation.id,
    whatsAppConnectionId: conversation.whatsAppConnectionId,
  };
}
