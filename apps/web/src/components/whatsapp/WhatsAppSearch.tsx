'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MessageSquareText, Search, X } from 'lucide-react';
import {
  searchWhatsAppConversationMessages,
  type WhatsAppMessageSearchResult,
} from '../../lib/crm-api';
import { normalizeWhatsAppDisplayPhone } from '../../lib/whatsapp-actions';
import { Button, IconButton } from '../ui/primitives';

type WhatsAppSearchMode = 'conversations' | 'messages';

const messageSearchPageSize = 10;

export function WhatsAppSearch({
  conversationQuery,
  onConversationQueryChange,
  onOpenMessage,
}: {
  conversationQuery: string;
  onConversationQueryChange: (query: string) => void;
  onOpenMessage: (result: WhatsAppMessageSearchResult, term: string) => void;
}) {
  const [mode, setMode] = useState<WhatsAppSearchMode>('conversations');
  const [messageQueryInput, setMessageQueryInput] = useState('');
  const [messageQuery, setMessageQuery] = useState('');
  const [messageResults, setMessageResults] = useState<WhatsAppMessageSearchResult[]>([]);
  const [messagePage, setMessagePage] = useState(1);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingMoreMessages, setLoadingMoreMessages] = useState(false);
  const [messageError, setMessageError] = useState('');
  const requestKeyRef = useRef('');

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setMessageQuery(messageQueryInput.trim());
    }, 300);

    return () => window.clearTimeout(timer);
  }, [messageQueryInput]);

  const loadMessageResults = useCallback(
    async ({ page, append }: { page: number; append: boolean }) => {
      const requestKey = JSON.stringify({ messageQuery, page });
      requestKeyRef.current = requestKey;
      if (append) {
        setLoadingMoreMessages(true);
      } else {
        setLoadingMessages(true);
        setMessageResults([]);
      }
      setMessageError('');

      try {
        const payload = await searchWhatsAppConversationMessages({
          q: messageQuery,
          page,
          pageSize: messageSearchPageSize,
        });
        if (requestKeyRef.current !== requestKey) return;
        setMessageResults((current) => (append ? [...current, ...payload.items] : payload.items));
        setMessagePage(page);
        setHasMoreMessages(Boolean(payload.pagination.hasMore));
      } catch {
        setMessageError('Falha ao buscar mensagens.');
      } finally {
        setLoadingMessages(false);
        setLoadingMoreMessages(false);
      }
    },
    [messageQuery],
  );

  useEffect(() => {
    if (mode !== 'messages') return;
    if (messageQuery.length < 2) {
      requestKeyRef.current = JSON.stringify({ messageQuery, state: 'idle' });
      setMessageResults([]);
      setMessagePage(1);
      setHasMoreMessages(false);
      setMessageError('');
      return;
    }

    void loadMessageResults({ page: 1, append: false });
  }, [loadMessageResults, messageQuery, mode]);

  const activeQuery = mode === 'conversations' ? conversationQuery : messageQueryInput;
  const showMessageHint = mode === 'messages' && messageQueryInput.trim().length < 2;

  return (
    <section className="whatsapp-search-panel" aria-label="Busca do WhatsApp Inbox">
      <div className="whatsapp-search-tabs" role="tablist" aria-label="Escopo da busca">
        <button
          aria-selected={mode === 'conversations'}
          className={mode === 'conversations' ? 'active' : ''}
          role="tab"
          type="button"
          onClick={() => setMode('conversations')}
        >
          Conversas
        </button>
        <button
          aria-selected={mode === 'messages'}
          className={mode === 'messages' ? 'active' : ''}
          role="tab"
          type="button"
          onClick={() => setMode('messages')}
        >
          Mensagens
        </button>
      </div>

      <label className="conversation-search whatsapp-search-input">
        <Search aria-hidden="true" size={16} />
        <input
          aria-label={
            mode === 'conversations'
              ? 'Buscar conversas por nome ou telefone'
              : 'Buscar texto nas mensagens'
          }
          placeholder={
            mode === 'conversations'
              ? 'Buscar conversas por nome ou telefone...'
              : 'Buscar texto nas mensagens...'
          }
          value={activeQuery}
          onChange={(event) => {
            if (mode === 'conversations') {
              onConversationQueryChange(event.target.value);
            } else {
              setMessageQueryInput(event.target.value);
            }
          }}
        />
        {activeQuery ? (
          <IconButton
            icon={X}
            label="Limpar busca"
            onClick={() => {
              if (mode === 'conversations') {
                onConversationQueryChange('');
              } else {
                requestKeyRef.current = JSON.stringify({ messageQuery: '', state: 'cleared' });
                setMessageQueryInput('');
                setMessageQuery('');
                setMessageResults([]);
              }
            }}
          />
        ) : null}
      </label>

      {mode === 'messages' ? (
        <div className="whatsapp-message-search-results" aria-live="polite">
          {showMessageHint ? (
            <span className="whatsapp-search-hint">Digite ao menos 2 caracteres.</span>
          ) : null}
          {loadingMessages ? (
            <span className="whatsapp-search-hint">Buscando mensagens...</span>
          ) : null}
          {messageError ? (
            <div className="notice danger conversation-notice" role="alert">
              {messageError}
            </div>
          ) : null}
          {!loadingMessages &&
          !messageError &&
          messageQuery.length >= 2 &&
          !messageResults.length ? (
            <span className="whatsapp-search-hint">Nenhuma mensagem encontrada.</span>
          ) : null}
          {messageResults.map((result) => (
            <button
              className="whatsapp-message-search-result"
              key={result.message.id}
              type="button"
              onClick={() => onOpenMessage(result, messageQuery)}
            >
              <span className="whatsapp-message-search-icon">
                <MessageSquareText aria-hidden="true" size={15} />
              </span>
              <span className="whatsapp-message-search-copy">
                <strong>{result.conversation.displayName}</strong>
                <span>{renderHighlightedSearchText(result.snippet, messageQuery)}</span>
                <small>
                  {result.message.direction === 'OUTBOUND' ? 'Enviada' : 'Recebida'} ·{' '}
                  {conversationSearchDate(result.message.sentAt ?? result.message.createdAt)} ·{' '}
                  {normalizeWhatsAppDisplayPhone(result.conversation.phoneNormalized) ??
                    result.conversation.phone}
                </small>
              </span>
            </button>
          ))}
          {hasMoreMessages ? (
            <Button
              loading={loadingMoreMessages}
              size="sm"
              variant="ghost"
              onClick={() => void loadMessageResults({ page: messagePage + 1, append: true })}
            >
              Carregar mais resultados
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export function renderHighlightedSearchText(text: string, term: string) {
  const trimmedTerm = term.trim();
  if (!trimmedTerm) return text;

  const lowerText = text.toLocaleLowerCase('pt-BR');
  const lowerTerm = trimmedTerm.toLocaleLowerCase('pt-BR');
  const parts: Array<{ text: string; highlight: boolean }> = [];
  let cursor = 0;
  let index = lowerText.indexOf(lowerTerm);

  while (index !== -1) {
    if (index > cursor) {
      parts.push({ text: text.slice(cursor, index), highlight: false });
    }
    parts.push({ text: text.slice(index, index + trimmedTerm.length), highlight: true });
    cursor = index + trimmedTerm.length;
    index = lowerText.indexOf(lowerTerm, cursor);
  }

  if (cursor < text.length) {
    parts.push({ text: text.slice(cursor), highlight: false });
  }

  return parts.map((part, partIndex) =>
    part.highlight ? (
      <mark key={`${part.text}-${partIndex}`}>{part.text}</mark>
    ) : (
      <span key={`${part.text}-${partIndex}`}>{part.text}</span>
    ),
  );
}

function conversationSearchDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
  }).format(new Date(value));
}
