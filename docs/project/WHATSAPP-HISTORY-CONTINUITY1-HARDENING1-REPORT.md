# WHATSAPP HISTORY CONTINUITY1 — HARDENING1

Data: 2026-11-11

## Veredito

`READY_FOR_HOMOLOGATION`

O endurecimento foi implementado exclusivamente no worktree isolado
`feature/whatsapp-history-continuity1-hardening1`, baseado no candidato
`4d8e2d494318b04156f4a0110be9b1883485a21b`. Nenhuma ação foi executada em
produção, `main`, Git remoto, KiraGo ativo ou serviços.

## Correções

- Continuidade automática agora exige identidade empresarial válida e igual nas
  conexões predecessora e sucessora, normalizada a partir de
  `WhatsAppConnection.phone` preenchido pelo status autenticado do KiraGo.
- Identidade ausente, inválida ou divergente bloqueia o vínculo e retorna motivo
  auditável; nenhuma identidade é inferida ou preenchida por suposição.
- Guarda outbound central bloqueia predecessoras com HTTP 409 e código estável
  `WHATSAPP_CONVERSATION_SUPERSEDED`, expondo somente o ID seguro da sucessora.
- A guarda cobre texto, mídia, voz, presença, retry, reações, edição e exclusão,
  com nova verificação imediatamente antes do despacho efetivo. Pendências
  criadas antes de uma corrida são marcadas como falhas sem chamar o provider.
- A vinculação segura de cliente dispara reconciliação best-effort e idempotente
  após o commit.
- O backfill administrativo existente foi preservado como procedimento único:
  dry-run por padrão, motivos por candidato, aplicação auditável, idempotente e
  retomável por reexecução. Não foi executado em produção.
- A migration aprovada não mudou; o baseline permanece com 57 migrations.

## Arquivos alterados

- `apps/api/src/whatsapp/whatsapp.service.ts`
- `apps/api/src/whatsapp/whatsapp.service.test.ts`
- `apps/api/src/whatsapp/whatsapp-conversation-continuity-postgres.test.ts`
- `docs/project/WHATSAPP-HISTORY-CONTINUITY1-HARDENING1-REPORT.md`
- `docs/project/WHATSAPP-HISTORY-CONTINUITY1-HARDENING1-SHA256SUMS`

Financeiro, Billing, Recovery, FastFlow, FastPay, FastPix e Mercado Pago não
foram alterados.

## Validação

- PostgreSQL 12.22 efêmero: 57/57 migrations aplicadas.
- API com PostgreSQL real: 79 arquivos e 2.021/2.021 testes aprovados, sem skips.
- Matriz PostgreSQL CONTINUITY1: 5/5 aprovada após o endurecimento.
- Testes web: 833/833; shared: 9/9.
- Prisma validate: PASS.
- Typecheck shared/API/web: PASS.
- Build shared/API/web: PASS.
- Lint: zero erros e seis avisos preexistentes fora do delta.
- `git diff --check`: PASS.
- Hash das tabelas protegidas antes/depois da matriz PostgreSQL:
  `c84e389f85e883321c9719272ea78a6b028627e2522a5791bdfa89f07ad00e49`.
- Fixtures residuais de homologação, vínculos de continuidade e migrations
  incompletas: zero.

## Cobertura específica

- Mesmo número empresarial em formatos diferentes: permitido.
- Número divergente, ausente ou inválido em qualquer lado: bloqueado.
- Contato/clientId incompatível, ambiguidade, atendimento ativo e ciclos:
  bloqueados.
- Exatamente 32 elos: permitido; 33º elo: bloqueado.
- Envio por predecessora em todas as modalidades: HTTP 409, sem provider.
- Envio legítimo pela sucessora: aprovado.
- Cliente vinculado depois da criação e sucessora preexistente: reconciliados.
- Corrida entre validação inicial e despacho: detectada na guarda final.
- Histórico permanece somente leitura, pesquisável e preservado nas conversas
  originais.

## Riscos remanescentes

- A automação depende de o KiraGo fornecer uma identidade empresarial válida no
  status autenticado. Enquanto ela estiver ausente ou inválida, o vínculo fica
  deliberadamente bloqueado para revisão, sem tentativa de adivinhação.
- Como o despacho ao provider é uma chamada externa, não existe transação ACID
  única entre PostgreSQL e KiraGo. A guarda repetida imediatamente antes da
  chamada elimina o bypass conhecido e reduz a janela residual ao limite entre a
  última leitura e a requisição externa; nenhuma mensagem é redirecionada.
- O backfill inicial ainda exige autorização produtiva separada, começando por
  dry-run e revisão dos motivos antes de qualquer aplicação.

## Próximo gate

Homologar o candidato endurecido em PostgreSQL isolado com os mesmos cenários e
revisar o dry-run do backfill sanitizado. Migration produtiva, deploy, restart,
push, merge e reconciliação real continuam sem autorização.
