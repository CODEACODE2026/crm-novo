'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { listClientOptions, type ClientOption } from '../../lib/crm-api';

export const CLIENT_REFERRAL_SEARCH_DEBOUNCE_MS = 300;

interface ClientReferralSelectProps {
  value: string;
  onChange: (clientId: string) => void;
}

export function ClientReferralSelect({ value, onChange }: ClientReferralSelectProps) {
  const [search, setSearch] = useState('');
  const [options, setOptions] = useState<ClientOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<ClientOption | null>(null);
  const requestIdRef = useRef(0);

  const visibleOptions = useMemo(
    () => ensureSelectedOption(options, selected, value),
    [options, selected, value],
  );

  useEffect(() => {
    if (!value) {
      setSelected(null);
    }
  }, [value]);

  useEffect(() => {
    if (!search.trim()) {
      setOptions([]);
      setLoading(false);
      return undefined;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);

    return scheduleClientReferralSearch(
      search,
      listClientOptions,
      (items) => {
        if (requestIdRef.current === requestId) {
          setOptions(items);
        }
      },
      () => {
        if (requestIdRef.current === requestId) {
          setLoading(false);
        }
      },
    );
  }, [search]);

  function selectOption(option: ClientOption | null) {
    const nextState = resolveReferralSelection(option);

    setSelected(nextState.selected);
    setSearch(nextState.search);
    setOptions(nextState.options);
    setOpen(nextState.open);
    onChange(nextState.value);
  }

  return (
    <div className="client-referral-select">
      <div className="autocomplete-search-box">
        <div className="autocomplete-control">
          <Search aria-hidden="true" size={16} />
          <input
            aria-label="Indicado por"
            autoComplete="off"
            placeholder={selected ? selected.name : 'Pesquisar cliente'}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
          />
          {value ? (
            <button
              aria-label="Limpar indicador"
              className="inline-icon-button"
              type="button"
              onClick={() => selectOption(null)}
            >
              <X aria-hidden="true" size={15} />
            </button>
          ) : null}
        </div>

        {open && (search.trim() || value) ? (
          <div className="autocomplete-menu">
            <button
              className="autocomplete-option"
              type="button"
              onClick={() => selectOption(null)}
            >
              <strong>Sem indicação</strong>
              <span>Não vincular indicador</span>
            </button>

            {loading ? <div className="autocomplete-status">Carregando...</div> : null}

            {!loading && search.trim() && !visibleOptions.length ? (
              <div className="autocomplete-status">Nenhum cliente encontrado</div>
            ) : null}

            {!loading
              ? visibleOptions.map((option) => (
                  <button
                    key={option.id}
                    className="autocomplete-option"
                    type="button"
                    onClick={() => selectOption(option)}
                  >
                    <strong>{option.name}</strong>
                    <span>
                      {option.reference} · {formatNormalizedBrazilPhone(option.phoneNormalized)}
                    </span>
                  </button>
                ))
              : null}
          </div>
        ) : null}
      </div>

      <div className="selected-referral">
        {selected ? (
          <>
            <strong>{selected.name}</strong>
            <span>
              {selected.reference} · {formatNormalizedBrazilPhone(selected.phoneNormalized)}
            </span>
          </>
        ) : (
          <span>Sem indicação</span>
        )}
      </div>
    </div>
  );
}

export function ensureSelectedOption(
  options: ClientOption[],
  selected: ClientOption | null,
  value: string,
) {
  if (!selected || !value || options.some((option) => option.id === selected.id)) {
    return options;
  }

  return [selected, ...options];
}

export function resolveReferralSelection(option: ClientOption | null) {
  return {
    selected: option,
    value: option?.id ?? '',
    search: '',
    options: [],
    open: false,
  };
}

export function scheduleClientReferralSearch(
  search: string,
  fetcher: (search: string) => Promise<ClientOption[]>,
  onSuccess: (items: ClientOption[]) => void,
  onDone: () => void,
  delay = CLIENT_REFERRAL_SEARCH_DEBOUNCE_MS,
) {
  const term = search.trim();

  if (!term) {
    return undefined;
  }

  const timeout = globalThis.setTimeout(() => {
    fetcher(term)
      .then(onSuccess)
      .catch(() => onSuccess([]))
      .finally(onDone);
  }, delay);

  return () => globalThis.clearTimeout(timeout);
}

export function formatNormalizedBrazilPhone(phoneNormalized: string) {
  const digits = phoneNormalized.replace(/\D/g, '');
  const local = digits.startsWith('55') ? digits.slice(2) : digits;

  if (local.length === 11) {
    return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  }

  if (local.length === 10) {
    return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  }

  return phoneNormalized;
}
