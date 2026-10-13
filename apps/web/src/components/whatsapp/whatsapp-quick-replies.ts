export type WhatsAppQuickReply = {
  id: string;
  label: string;
  text: string;
};

export type WhatsAppQuickReplyApplyResult = {
  cursor: number;
  text: string;
};

const whatsappQuickReplySlashPattern = /^\/\S*$/;

export const WHATSAPP_DEFAULT_QUICK_REPLIES: WhatsAppQuickReply[] = [
  {
    id: 'greeting',
    label: 'Saudação',
    text: 'Olá! Tudo bem? Como posso ajudar?',
  },
  {
    id: 'waiting-payment',
    label: 'Aguardando pagamento',
    text: 'Olá! Ficamos no aguardo do pagamento. Assim que for identificado, damos continuidade.',
  },
  {
    id: 'expired-pix',
    label: 'PIX expirado',
    text: 'Esse PIX expirou. Posso gerar uma nova cobrança para você.',
  },
  {
    id: 'payment-confirmed',
    label: 'Pagamento confirmado',
    text: 'Pagamento confirmado. Obrigado!',
  },
  {
    id: 'follow-up',
    label: 'Retorno',
    text: 'Assim que eu tiver uma atualização, retorno por aqui.',
  },
  {
    id: 'closing',
    label: 'Encerramento',
    text: 'Qualquer dúvida, estou à disposição.',
  },
];

export function filterWhatsAppQuickReplies(
  replies: WhatsAppQuickReply[],
  search: string,
): WhatsAppQuickReply[] {
  const normalizedSearch = search.trim().toLocaleLowerCase('pt-BR');
  if (!normalizedSearch) return replies;

  return replies.filter((reply) => {
    const label = reply.label.toLocaleLowerCase('pt-BR');
    const text = reply.text.toLocaleLowerCase('pt-BR');

    return label.includes(normalizedSearch) || text.includes(normalizedSearch);
  });
}

export function applyWhatsAppQuickReply(
  draft: string,
  quickReplyText: string,
  selection?: { end: number; start: number } | null,
): WhatsAppQuickReplyApplyResult {
  if (!draft.trim()) {
    return { cursor: quickReplyText.length, text: quickReplyText };
  }

  const hasSelection =
    selection &&
    Number.isInteger(selection.start) &&
    Number.isInteger(selection.end) &&
    selection.start >= 0 &&
    selection.end >= selection.start &&
    selection.end <= draft.length;

  if (!hasSelection) {
    const base = draft.replace(/\s+$/, '');
    const text = `${base}\n${quickReplyText}`;

    return { cursor: text.length, text };
  }

  const before = draft.slice(0, selection.start);
  const after = draft.slice(selection.end);
  const prefixBase = before.replace(/[ \t]+$/, '');
  const suffixBase = after.replace(/^[ \t]+/, '');
  const prefix = prefixBase && !prefixBase.endsWith('\n') ? `${prefixBase}\n` : prefixBase;
  const suffix = suffixBase && !suffixBase.startsWith('\n') ? `\n${suffixBase}` : suffixBase;
  const text = `${prefix}${quickReplyText}${suffix}`;

  return { cursor: prefix.length + quickReplyText.length, text };
}

export function applyWhatsAppSlashQuickReply(
  quickReplyText: string,
): WhatsAppQuickReplyApplyResult {
  return { cursor: quickReplyText.length, text: quickReplyText };
}

export function whatsAppQuickReplySlashQuery(draft: string) {
  return whatsappQuickReplySlashPattern.test(draft) ? draft.slice(1) : null;
}

export function whatsAppQuickReplyPreview(text: string, maxLength = 64) {
  const normalized = text.trim().replace(/\s+/g, ' ');
  if (normalized.length <= maxLength) return normalized;

  return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`;
}
