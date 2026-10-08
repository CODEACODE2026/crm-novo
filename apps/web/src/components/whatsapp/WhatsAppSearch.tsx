'use client';

import { ArrowDown, ArrowUp, Search, X } from 'lucide-react';
import { type KeyboardEvent } from 'react';
import { Button, IconButton } from '../ui/primitives';

export function ConversationSearch({
  query,
  onQueryChange,
}: {
  query: string;
  onQueryChange: (query: string) => void;
}) {
  return (
    <label className="conversation-search" aria-label="Buscar conversas">
      <Search aria-hidden="true" size={16} />
      <input
        aria-label="Buscar conversas por nome ou telefone"
        placeholder="Buscar nome ou telefone"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
      />
      {query ? (
        <IconButton icon={X} label="Limpar busca de conversas" onClick={() => onQueryChange('')} />
      ) : null}
    </label>
  );
}

export function ConversationMessageSearch({
  currentIndex,
  error,
  hasResults,
  loading,
  loadingMore,
  hasMore,
  open,
  query,
  total,
  onClose,
  onNext,
  onPrevious,
  onLoadMore,
  onQueryChange,
}: {
  currentIndex: number;
  error: string;
  hasResults: boolean;
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  open: boolean;
  query: string;
  total: number;
  onClose: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onLoadMore: () => void;
  onQueryChange: (query: string) => void;
}) {
  if (!open) return null;

  const trimmedQuery = query.trim();
  const status = loading
    ? 'Buscando...'
    : error || (trimmedQuery.length >= 2 && !hasResults ? 'Nenhuma mensagem encontrada' : '');
  const counter = hasResults ? `${currentIndex + 1} de ${total}` : '0 de 0';

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      if (event.shiftKey) {
        onPrevious();
      } else {
        onNext();
      }
    }
  }

  return (
    <div className="conversation-message-search-bar" aria-live="polite">
      <label className="conversation-search conversation-message-search-input">
        <Search aria-hidden="true" size={15} />
        <input
          aria-label="Buscar mensagens nesta conversa"
          autoFocus
          placeholder="Buscar nesta conversa..."
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={handleKeyDown}
        />
      </label>
      <span
        aria-label={hasResults ? `Resultado ${currentIndex + 1} de ${total}` : 'Nenhum resultado'}
        className="conversation-message-search-counter"
      >
        {counter}
      </span>
      <IconButton
        disabled={!hasResults}
        label="Resultado anterior"
        icon={ArrowUp}
        className="conversation-search-previous"
        onClick={onPrevious}
      />
      <IconButton
        disabled={!hasResults}
        label="Próximo resultado"
        icon={ArrowDown}
        className="conversation-search-next"
        onClick={onNext}
      />
      <IconButton icon={X} label="Fechar busca" onClick={onClose} />
      {hasMore ? (
        <Button
          className="conversation-message-search-more"
          loading={loadingMore}
          size="sm"
          variant="ghost"
          onClick={onLoadMore}
        >
          Carregar mais resultados
        </Button>
      ) : null}
      {status ? (
        <span className={error ? 'conversation-message-search-error' : ''}>{status}</span>
      ) : null}
    </div>
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
