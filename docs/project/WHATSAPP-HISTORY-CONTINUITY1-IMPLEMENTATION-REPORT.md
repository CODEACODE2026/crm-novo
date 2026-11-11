# CRM NOVO — WhatsApp History Continuity 1

## Estado

- Base isolada: `776df23394109945f9f370d71773663876813da6`.
- Ambiente alterado: somente worktree de desenvolvimento.
- Produção, conexão KiraGo, banco produtivo, migrations e deploy: não acessados.
- Escopo financeiro, Billing, Recovery e provedores PIX: sem alterações.

## Causa raiz

`WhatsAppConversation` é única por `(whatsAppConnectionId, phoneNormalized)`. Tanto o webhook
quanto o fluxo de iniciar conversa procuram dentro da conexão selecionada. Uma nova instância
KiraGo produz uma nova `WhatsAppConnection`; consequentemente, o mesmo telefone cria outra
conversa. A interface lista atendimentos `ACTIVE` por padrão, ocultando históricos antigos sem
atendimento pendente ou em andamento.

## Solução

### Relação auditável

A migration aditiva cria `whatsapp_conversation_continuities` com:

- uma predecessora por sucessora e uma sucessora por predecessora;
- FKs `RESTRICT` para preservar as duas conversas;
- ator administrativo opcional com FK `SET NULL`;
- data de criação e restrição contra autorreferência.

Nenhum ID de conversa ou mensagem é reescrito. Não há `UPDATE`, `DELETE` ou movimentação de
mensagens na migration.

### Reconciliação

`POST /whatsapp/conversation-continuities/reconcile` recebe a conexão sucessora e opera em:

- `apply=false`: dry-run sem escrita;
- `apply=true`: criação transacional e idempotente dos vínculos.

Um vínculo automático somente é elegível quando:

1. telefone normalizado é idêntico;
2. E.164 não diverge;
3. existe `clientId` e ele é idêntico nas duas conversas;
4. as conversas pertencem a conexões diferentes;
5. a predecessora é anterior e é a cauda ainda não vinculada da cadeia;
6. não há mais de uma candidata;
7. a predecessora não possui atendimento `PENDING` ou `IN_PROGRESS`.

LID, JID isolado, telefone sem cliente comprovado e cliente isolado nunca são usados como
identidade. Conflitos e ambiguidades são reportados e não geram escrita. A reconciliação automática
do webhook é best-effort e não pode bloquear a persistência/idempotência da mensagem.

### Leitura e operação

- A lista omite apenas predecessoras já vinculadas; históricos sem sucessora continuam em `Todos`.
- A sucessora pagina mensagens de toda a cadeia por `(createdAt, id)`.
- Mensagens anteriores recebem `isHistorical=true` e preservam seu `conversationId` original.
- A UI sinaliza histórico anterior e remove responder, reagir, editar, apagar, encaminhar, salvar
  figurinha e retry desses itens.
- Mídia local histórica continua endereçada pela conversa original.
- Novos envios usam somente a conversa sucessora e sua conexão operacional.
- Busca e contexto ao redor de uma mensagem respeitam a cadeia.

Atendimentos, etiquetas, automações, vínculos de clientes, referências financeiras e mensagens não
são alterados. Uma predecessora com atendimento ativo não é vinculada automaticamente; deve ser
resolvida antes de nova reconciliação.

## Migração e rollback

### Aplicação proposta

1. backup/checkpoint autorizado;
2. executar a migration aditiva;
3. publicar API e web compatíveis;
4. dry-run para a conexão nova;
5. revisar `ELIGIBLE`, `AMBIGUOUS` e `NO_MATCH`;
6. autorizar aplicação somente dos vínculos elegíveis;
7. validar contagens, paginação, histórico, envio e webhook.

### Rollback

- Antes de criar vínculos: rollback estrutural pode remover exclusivamente a tabela nova.
- Depois de criar vínculos: rollback recomendado é somente da aplicação; manter a tabela e o log
  auditável. Remover a tabela apagaria evidência e exige autorização destrutiva separada.
- Não existe rollback de banco financeiro, mensagens ou conexões.

## Impacto esperado em produção

- Migration pequena e aditiva, sem varrer ou atualizar as 30 mil mensagens existentes.
- A leitura de timeline adiciona buscas indexadas de links e uma consulta de mensagens com poucos
  IDs de conversa.
- Limite defensivo de 32 reconexões por cadeia e detecção explícita de ciclo.
- A reconciliação em lote retorna somente IDs e estados; não expõe telefone, conteúdo ou PII.

## Validação executada

- Testes focados de continuidade e migration: `455/455` aprovados.
- Suíte completa da API: `2021` aprovados e `106` testes PostgreSQL condicionais ignorados por
  ausência de um banco de integração configurado nesta execução.
- `prisma validate`: aprovado com Prisma `6.19.3`; nenhuma conexão ou migration foi executada.
- Typecheck completo de shared, API e web: aprovado.
- Build completo de shared, API e web: aprovado.
- Lint: zero erros; seis avisos preexistentes (`<img>` no frontend e um `eslint-disable` em
  Recovery), nenhum introduzido pela continuidade.
- `git diff --check`: aprovado.

Os testes cobrem webhook, iniciar conversa, dry-run/aplicação idempotente, conflito e ambiguidade,
cliente ausente/divergente, cadeia com múltiplas reconexões, paginação cronológica, deduplicação
visual, busca/contexto e preservação do roteamento pela conexão sucessora.

## Veredito

`READY_FOR_HOMOLOGATION`, mas `NO_GO_PRODUCTION` nesta etapa. Antes de qualquer publicação, ainda é
obrigatório validar a migration e os fluxos ponta a ponta em PostgreSQL de homologação com uma cópia
sanitizada das topologias auditadas, revisar o dry-run e obter autorizações separadas para migration,
deploy e criação dos vínculos.

## Autorização ainda necessária

Nenhuma ação produtiva está autorizada por este trabalho. Migration, publicação, dry-run produtivo,
aplicação dos três vínculos auditados e deploy exigem autorizações separadas.
