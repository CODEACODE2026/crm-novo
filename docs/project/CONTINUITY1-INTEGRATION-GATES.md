# CONTINUITY1 PREPARE-ONLY — gates de integração

## Compatibilidade Git

- branch: `feature/continuity1-prepare-only`;
- baseline funcional: `f38e75717a505b915e1ff42e3308faeeac1c5289`;
- `origin/main` auditado: `7e8edb35d365002aed9b9d82264529a5348939d3`;
- merge-base com `origin/main`: o próprio `origin/main`;
- relação antes do commit deste gate: 0 commits atrás e 14 à frente;
- nenhum merge, rebase, push ou alteração de ref remota foi executado.

O baseline `f38e757` permanece ancestral direto. PAYMENT2 e o visual dedup são preservados;
o delta deste gate não modifica serializers KiraGo, provider PIX, geração/confirmacão de
cobrança, migrations financeiras ou payloads dos provedores.

## Gates implementados

1. confirmação explícita do operador para o primeiro outbound manual de uma predecessora
   com sucessora `PREPARED`;
2. somente texto novo simples nessa ativação inicial;
3. ativação apenas após confirmação do provider;
4. inbound real continua ativando dentro da transação de persistência;
5. guard central antes do provider para Billing, Recovery, PIX/ativação e envio
   administrativo;
6. preparação bloqueada por dispatch `PENDING`, `SCHEDULED` ou `PROCESSING` concorrente;
7. sucessora vazia continua oculta e a predecessora continua visível.

## Sequência de implantação proposta

### Gate D1 — backup e preflight

- backup privado das tabelas alcançadas pela migration e dos registros do piloto;
- registrar commit/tree do release, checksums e deployment anterior;
- confirmar migrations existentes, saúde da API e conexão WhatsApp operacional;
- confirmar que nenhum dos 5 IDs do piloto já possui preparação, sucessora ou vínculo.

### Gate D2 — migration aditiva

- aplicar somente `20261113190000_add_whatsapp_successor_preparations`;
- validar catálogo, índices, constraints e ausência de linhas na nova tabela;
- não executar endpoint `apply=true`.

### Gate D3 — deploy técnico

- implantar API e depois frontend do mesmo commit selado;
- validar health, login, listagem de conversas e filas Billing/Recovery;
- confirmar que, sem linhas `PREPARED`, o comportamento existente não muda;
- não preparar as 590 conversas.

### Gate A1 — ativação funcional

- executar dry-run apenas nos 5 IDs aprovados;
- exigir resultado exato e sem ambiguidade;
- mediante nova autorização, executar `apply=true` para esses 5 IDs;
- validar sucessoras vazias/ocultas e predecessoras visíveis.

### Gate A2 — observação e expansão

- observar inbound real e outbound manual explicitamente confirmado;
- validar ausência de envio artificial, duplicidade, ciclo e movimentação de histórico;
- lotes de 10 e 25 dependem de autorizações independentes.

## Rollback

- antes de qualquer preparação: voltar API/frontend ao deployment anterior; a migration
  aditiva pode permanecer vazia para evitar DDL destrutivo;
- `PREPARED` ainda vazia: cancelar pelo endpoint auditável e depois voltar o aplicativo;
- `ACTIVATED` ou sucessora com evento real: nunca apagar automaticamente; interromper novos
  lotes e tratar cada ID com plano específico;
- rollback nunca move ou copia mensagens/atendimentos e nunca altera Lote A.

## QA

- API: 2.054 testes aprovados; 114 integrações opcionais ignoradas no modo unitário;
- web: 855/855 testes aprovados;
- PostgreSQL 12.22 descartável: 64/64 migrations e 8/8 cenários aprovados;
- matriz combinada: prepare vazio/oculto, idempotência, outbound confirmado, inbound real,
  cancelamento, preservação do histórico, bloqueio de dispatch concorrente e guard real de
  automação; os oito cenários PostgreSQL validam as invariantes persistidas, enquanto o
  inbound real também é coberto na suíte integrada do serviço;
- typecheck: shared, API e web aprovados;
- lint: zero erros; cinco avisos preexistentes de `<img>` no frontend;
- build: API e Next.js 15.5.28 aprovados com
  `NEXT_PUBLIC_API_BASE_URL=https://api-crm-novo.ddns.net`;
- `git diff --check`: aprovado.

Produção, KiraGo real e dados das 590 conversas não foram acessados nesta etapa.
