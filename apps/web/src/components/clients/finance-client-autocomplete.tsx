'use client';

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Search, X } from 'lucide-react';
import {
  formatNormalizedBrazilPhone,
  scheduleClientReferralSearch,
} from './client-referral-select';
import { listClientOptions, type ClientOption } from '../../lib/crm-api';

function financeClientOptionDetails(option: ClientOption) {
  const phone = option.phoneNormalized ? formatNormalizedBrazilPhone(option.phoneNormalized) : '';
  return [phone, option.email].filter(Boolean).join(' • ');
}

export function FinanceClientAutocomplete({
  disabled = false,
  label = 'Cliente',
  placeholder = 'Buscar por nome, telefone ou e-mail...',
  required = false,
  selectedClient,
  value,
  onChange,
}: {
  disabled?: boolean;
  label?: string;
  placeholder?: string;
  required?: boolean;
  selectedClient: ClientOption | null;
  value: string;
  onChange: (clientId: string, client: ClientOption | null) => void;
}) {
  const [search, setSearch] = useState('');
  const [options, setOptions] = useState<ClientOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const requestIdRef = useRef(0);
  const trimmedSearch = search.trim();

  useEffect(() => {
    if (!trimmedSearch) {
      setOptions([]);
      setLoading(false);
      setActiveIndex(0);
      return undefined;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);

    return scheduleClientReferralSearch(
      trimmedSearch,
      (term) => listClientOptions(term, { limit: 15 }),
      (items) => {
        if (requestIdRef.current === requestId) {
          setOptions(items);
          setActiveIndex(0);
        }
      },
      () => {
        if (requestIdRef.current === requestId) {
          setLoading(false);
        }
      },
    );
  }, [trimmedSearch]);

  function selectClient(option: ClientOption | null) {
    onChange(option?.id ?? '', option);
    setSearch('');
    setOptions([]);
    setOpen(false);
    setActiveIndex(0);
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (!open && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
      setOpen(true);
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((current) => Math.min(Math.max(0, options.length - 1), current + 1));
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((current) => Math.max(0, current - 1));
    }

    if (event.key === 'Enter' && open && options.length) {
      event.preventDefault();
      selectClient(options[activeIndex] ?? options[0] ?? null);
    }

    if (event.key === 'Escape') {
      setOpen(false);
    }
  }

  const showMenu = open && trimmedSearch.length > 0;
  const selectedDetails = selectedClient ? financeClientOptionDetails(selectedClient) : '';

  return (
    <div className="field finance-client-autocomplete">
      <span>{label}</span>
      <div className="autocomplete-search-box">
        <div className="autocomplete-control">
          <Search aria-hidden="true" size={16} />
          <input
            aria-expanded={showMenu}
            aria-label={label}
            aria-required={required}
            autoComplete="off"
            disabled={disabled}
            placeholder={selectedClient ? selectedClient.name : placeholder}
            role="combobox"
            value={search}
            onBlur={() => {
              window.setTimeout(() => setOpen(false), 120);
            }}
            onChange={(event) => {
              if (value) {
                onChange('', null);
              }
              setSearch(event.target.value);
              setOpen(true);
            }}
            onFocus={() => {
              if (trimmedSearch) setOpen(true);
            }}
            onKeyDown={handleKeyDown}
          />
          {value ? (
            <button
              aria-label="Limpar cliente"
              className="inline-icon-button"
              disabled={disabled}
              type="button"
              onClick={() => selectClient(null)}
            >
              <X aria-hidden="true" size={15} />
            </button>
          ) : null}
        </div>

        {showMenu ? (
          <div className="autocomplete-menu" role="listbox">
            {loading ? <div className="autocomplete-status">Carregando...</div> : null}

            {!loading && !options.length ? (
              <div className="autocomplete-status">Nenhum cliente encontrado</div>
            ) : null}

            {!loading
              ? options.map((option, index) => (
                  <button
                    aria-selected={index === activeIndex}
                    className={`autocomplete-option${index === activeIndex ? ' active' : ''}`}
                    key={option.id}
                    role="option"
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => selectClient(option)}
                  >
                    <strong>{option.name}</strong>
                    {financeClientOptionDetails(option) ? (
                      <span>{financeClientOptionDetails(option)}</span>
                    ) : null}
                  </button>
                ))
              : null}
          </div>
        ) : null}
      </div>

      <div className="selected-referral finance-selected-client">
        {selectedClient ? (
          <>
            <strong>{selectedClient.name}</strong>
            {selectedDetails ? <span>{selectedDetails}</span> : null}
          </>
        ) : (
          <span>Sem cliente</span>
        )}
      </div>
    </div>
  );
}
