# CRM NOVO — WhatsApp History Continuity 1 — Homologation 1

## Veredito

`GO_FOR_SEPARATE_PRODUCTION_PLANNING`.

O resultado não autoriza migration, deploy, reconciliação real, restart, push ou merge. O próximo
gate deve preparar e revisar separadamente a migration produtiva, a publicação compatível e o
dry-run somente leitura antes de qualquer vínculo real.

## Escopo e isolamento

- Baseline: `776df23394109945f9f370d71773663876813da6`.
- Tree do baseline: `bbbf176c1ae28479ea88b8b9d4ac35226715c149`.
- Worktree: `/opt/codeacode/repos/crm-novo-whatsapp-continuity1`.
- PostgreSQL: `12.22`, banco efêmero exclusivo `crm_whatsapp_continuity_hml1`.
- Produção, KiraGo ativo, serviços, Git remoto e branch principal: não acessados.

## Migration real

O banco vazio exigiu a pré-condição histórica `pgcrypto`, já usada por migrations antigas para
`gen_random_uuid()`. O primeiro banco descartável foi removido sem fixtures, recriado com a extensão
e recebeu as **62 migrations** desde zero. A migration
`20261111190000_add_whatsapp_conversation_continuity` foi aplicada com sucesso.

Após a homologação:

- migrations concluídas: `62`;
- migrations falhas ou revertidas: `0`;
- links de continuidade residuais: `0`;
- clientes, usuários e conexões com prefixo de fixture: `0`.

Ao final, o banco efêmero foi removido e o servidor PostgreSQL 12.22 iniciado para esta homologação
foi encerrado normalmente.

## Suíte PostgreSQL

A primeira execução identificou uma expectativa antiga no teste de Relatórios: `61` migrations.
Ela foi atualizada para `62`; nenhuma consulta, métrica ou regra financeira foi alterada.

Resultado final com `RUN_DATABASE_TESTS=1`:

- arquivos de teste API: `88/88` aprovados;
- testes API: `2130/2130` aprovados;
- skips: `0`;
- os `106` testes PostgreSQL anteriormente condicionais foram todos executados;
- três novos testes PostgreSQL de continuidade também foram aprovados.

Tempos observados das consultas de Relatórios no run final:

- overview: `33,73 ms`;
- financeiro: `9,14 ms`;
- clientes: `11,45 ms`;
- renovações: `10,87 ms`.

## Três pares sanitizados

Uma conexão predecessora, uma conexão sucessora operacional e três clientes distintos reproduziram
os três pares auditados, sem telefone, nome, mensagem ou identificador produtivo.

- dry-run: `scanned=3`, `eligible=3`, `linked=0`;
- aplicação: `linked=3`;
- reaplicação: `alreadyLinked=3`, sem link duplicado;
- cardinalidade final durante a fixture: três links 1:1;
- mensagens históricas permaneceram na conversa/conexão predecessora;
- mensagens atuais permaneceram na sucessora;
- timeline retornou ordem cronológica global e `isHistorical=true` apenas para a predecessora;
- busca na predecessora apresentou a conversa sucessora como contexto operacional;
- novo envio simulou o provider e persistiu exclusivamente na conversa e conexão sucessoras.

## Bloqueios comprovados

- duas predecessoras elegíveis para uma sucessora: `AMBIGUOUS`, sem escrita;
- telefone igual com `clientId` divergente: `NO_MATCH`, sem escrita;
- predecessora com atendimento `IN_PROGRESS`: `NO_MATCH`, sem escrita;
- ciclo explícito: bloqueado na leitura;
- cadeia com exatamente 32 elos: aceita;
- 33º elo: bloqueado pelo limite defensivo.

A homologação corrigiu o off-by-one do limite de 32 e fez a reaplicação administrativa listar
conversas já vinculadas como `ALREADY_LINKED`, mantendo auditoria idempotente explícita.

## Frontend e histórico somente leitura

- suíte web: `850/850` aprovada;
- contrato automatizado confirma o marcador “Histórico anterior · somente leitura”;
- action rail e menu móvel são removidos para itens históricos;
- retry, seleção de arquivo e nova gravação de áudio ficam bloqueados;
- mídia histórica continua usando o `conversationId` original;
- typecheck e build de API/web foram aprovados.

Não houve sessão com navegador ou chamada ao KiraGo real; o provider foi simulado para comprovar o
roteamento pela sucessora, conforme a restrição de não alterar a conexão ativa.

## Invariantes financeiras e limpeza

Um dump determinístico somente de dados foi calculado antes e depois da suíte para Billing,
Recovery, credenciais/providers, intents, transações, recebíveis, grupos, dispatches, respostas e
campanhas.

- SHA-256 antes: `4f428408841466cd6598f50e903d58b60252ef0a7a569462246b38a984f47ef8`;
- SHA-256 depois: `4f428408841466cd6598f50e903d58b60252ef0a7a569462246b38a984f47ef8`.

FastFlow, FastPay, FastPix, Mercado Pago, Billing e Recovery permaneceram byte a byte invariantes no
banco. Nenhum arquivo de implementação desses subsistemas foi alterado; a única alteração fora do
domínio WhatsApp é o contador de migrations no teste PostgreSQL de Relatórios.

## Gates de qualidade

- lint: zero erros; seis avisos preexistentes;
- typecheck shared/API/web: aprovado;
- build shared/API/web: aprovado;
- `git diff --check`: aprovado;
- push, merge e commit: não executados.

## Próximo gate proposto

1. congelar o diff e gerar release revisável;
2. executar preflight produtivo estritamente read-only;
3. autorizar separadamente a migration aditiva;
4. autorizar separadamente o deploy compatível de API e web;
5. executar dry-run produtivo e revisar `ELIGIBLE`, `NO_MATCH` e `AMBIGUOUS`;
6. autorizar separadamente apenas os vínculos elegíveis;
7. manter rollback somente da aplicação após links, preservando a tabela auditável.
