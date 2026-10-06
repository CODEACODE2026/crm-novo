# CRM Novo - Orientacao Inicial de Ambiente e DevOps

## Escopo

Este documento orienta a preparacao inicial de ambiente. Nao executa deploy,
nao cria banco, nao aplica migration e nao configura producao nesta Sprint.

## Ambientes Previstos

- Desenvolvimento local.
- Homologacao futura.
- Producao futura.

Ambientes devem ser separados. Producao nao deve compartilhar banco de
desenvolvimento sem decisao explicita.

## Stack Prevista

- Node.js LTS.
- pnpm.
- PostgreSQL.
- Prisma.
- NestJS API.
- Next.js Web.
- Reverse proxy em producao.
- HTTPS em producao.
- Process manager ou runtime com restart automatico em producao.

## Instalacao Local

Na raiz do projeto:

```bash
corepack enable
corepack prepare pnpm@12.3.4 --activate
pnpm install
```

## PostgreSQL de Desenvolvimento

Usar banco exclusivo de desenvolvimento. Banco validado na homologacao tecnica
da Sprint 1:

```text
crm_novo_dev
```

Exemplo de criacao local, ajustando a senha fora do Git:

```sql
CREATE ROLE crm_novo_dev LOGIN PASSWORD 'senha-local-segura';
CREATE DATABASE crm_novo_dev OWNER crm_novo_dev;
```

## Variaveis de Ambiente Previstas

Backend:

- `NODE_ENV`.
- `PORT`.
- `API_HOST`: host de bind da API Nest. Em producao atras de Nginx, usar
  `127.0.0.1` ou rede privada; nao expor a porta Nest diretamente na internet.
- `DATABASE_URL`.
- `JWT_SECRET`.
- `JWT_EXPIRES_IN`.
- `CORS_ORIGIN`.
- `BCRYPT_ROUNDS`.
- `APP_TIMEZONE=America/Sao_Paulo`.
- `BILLING_SCHEDULER_ENABLED`: em producao e obrigatorio configurar
  explicitamente `true` ou `false`. Para primeiro deploy publico, usar
  `false`.
- `RECOVERY_SCHEDULER_ENABLED`: em producao e obrigatorio configurar
  explicitamente `true` ou `false`. Para primeiro deploy publico, usar
  `false`.
- `KIRAGO_WEBHOOK_TOKEN`: token forte validado no webhook publico Kirago.
- `CRM_API_PUBLIC_URL`: URL publica HTTPS da API para webhooks externos
  (WhatsApp e registro de webhook de pagamentos).
- `WHATSAPP_MEDIA_STORAGE_DIR`: diretorio privado local da API para guardar
  copias de midias outbound enviadas pelo CRM. Em producao, usar por exemplo
  `/var/lib/crm-novo/whatsapp-media`.
- `WHATSAPP_FFMPEG_PATH`: caminho absoluto do binario ffmpeg usado para
  converter gravacoes de voz WebM/Opus em OGG/Opus. Em producao, usar
  `/usr/bin/ffmpeg`.
- `WHATSAPP_VOICE_TEMP_DIR`: diretorio privado temporario para conversoes de
  voz. Em producao, usar por exemplo
  `/var/lib/crm-novo/whatsapp-media/tmp/audio4`, com owner do servico da API,
  permissao `0700` e arquivos temporarios `0600`.
- `CRM_PUBLIC_URL`: fallback legado aceito pelo registro de webhook de
  pagamentos; novas instalacoes devem usar `CRM_API_PUBLIC_URL`.
- `FASTDEPIX_NOTIFICATION_URL`: URL explicita opcional enviada na criacao de
  PIX; quando configurada, sobrescreve a ausencia de URL derivada.
- `ADMIN_EMAIL`.
- `ADMIN_NAME`.
- `ADMIN_PASSWORD`.

Criar `apps/api/.env` local a partir de `apps/api/.env.example`. Esse arquivo
nao deve ser versionado.

Frontend:

- `NEXT_PUBLIC_API_BASE_URL`.

Criar `apps/web/.env` local a partir de `apps/web/.env.example`. Esse arquivo
nao deve ser versionado.

Futuro WhatsApp:

- Variaveis reais somente depois da API escolhida.

Futuro PIX:

- Variaveis reais somente depois da API escolhida.

## Seguranca

- Nenhum segredo deve entrar no Git.
- Criar `.env.example` apenas com nomes e valores ficticios seguros.
- JWT secret deve ser forte e obrigatorio em producao.
- Producao falha no startup se `JWT_SECRET`, `CORS_ORIGIN`, chave de
  criptografia de provider, `KIRAGO_WEBHOOK_TOKEN` ou flags de scheduler forem
  ausentes/fracos/invalidos.
- Autenticacao web deve usar JWT em cookie `HttpOnly`.
- Cookie de autenticacao deve usar `Secure` em producao e `SameSite` adequado.
- Token principal de autenticacao nao deve ser armazenado em `localStorage`.
- Refresh token fica preparado como estrategia futura, sem complexidade
  prematura na primeira entrega.
- CORS em producao deve usar allowlist.
- Como a autenticacao usa cookie, requisicoes mutaveis autenticadas vindas de
  navegador devem passar por validacao de `Origin` contra `CORS_ORIGIN`.
- Login deve ter rate limit quando exposto.
- Logs nao devem expor tokens, cookies, senhas ou payloads sensiveis completos.
- Erros de producao nao devem expor stack trace.
- O diretorio de `WHATSAPP_MEDIA_STORAGE_DIR` nao deve ficar dentro do Git,
  nem dentro de `/opt/crm-novo/app`, nem ser exposto por Nginx/static. O unico
  acesso deve ser pelo endpoint autenticado do CRM.
- Criar o diretorio de midia WhatsApp com dono igual ao usuario do
  `crm-novo-api.service` e permissoes restritas, por exemplo `0750` no
  diretorio e arquivos `0600`. Nao usar `chmod 777`.

Fora de producao, flags ausentes ou desconhecidas continuam fail-closed: nao
ligam scheduler.

## Banco

- PostgreSQL como banco principal.
- Migrations Prisma versionadas.
- Seeds separados de migrations.
- Datas de negocio devem ser modeladas como PostgreSQL `DATE`.
- Datas tecnicas como `createdAt`, `updatedAt`, logs e auditoria devem ser
  timestamps.
- Usuario de producao com privilegio minimo.
- Backup obrigatorio antes de go-live.
- Restore test obrigatorio antes de go-live relevante.

Comandos locais:

```bash
pnpm --filter @crm-novo/api exec prisma migrate deploy
pnpm --filter @crm-novo/api prisma:seed
```

`prisma migrate deploy` aplica migrations existentes. Em desenvolvimento de nova
schema, usar migration nova e versionada.

## Execucao Local

API:

```bash
pnpm --filter @crm-novo/api dev
```

Porta padrao: `3001`.

Web:

```bash
pnpm --filter @crm-novo/web dev
```

Porta padrao: `3000`.

Frontend e API rodam separados. O frontend usa
`NEXT_PUBLIC_API_BASE_URL=http://localhost:3001` em desenvolvimento.

## Jobs

Nesta fase, arquitetura preparada para jobs persistidos em banco.

Redis/BullMQ:

- Nao adicionar na fundacao.
- Reavaliar quando WhatsApp real, volume de mensagens ou concorrencia exigir.

## Midia WhatsApp Outbound

Midias recebidas continuam usando metadata/download da Kirago. Midias enviadas
pelo proprio CRM devem ser gravadas em storage privado da API depois que a
Kirago aceitar o envio, pois a resposta outbound da Kirago nao fornece URL,
directPath, mediaKey, hashes, MIME ou tamanho recuperaveis posteriormente.

Politica atual:

- Arquivos permanecem enquanto a mensagem existir.
- Nao ha limpeza automatica nesta tarefa.
- Pendencias futuras: politica de retencao, limpeza de orfaos, quota e metricas
  de uso de disco.
- Exclusao/cascade de mensagens ou conversas nao deve remover arquivos sem
  analise e regra aprovada.

## Deploy Futuro

Antes de producao:

- Build da API aprovado.
- Build do frontend aprovado.
- Typecheck aprovado.
- Tests aprovados.
- Lint aprovado.
- Security baseline aprovado.
- Variaveis reais configuradas fora do Git.
- HTTPS configurado.
- Reverse proxy configurado.
- Healthcheck disponivel.
- Backup configurado.
- Rollback definido.

## Git

- Nao fazer commit sem autorizacao.
- Nao fazer push sem autorizacao.
- Cada Sprint deve revisar diff antes da homologacao.
- Commit futuro deve conter somente arquivos da Sprint aprovada.
- Push futuro somente com autorizacao explicita.

## Observabilidade

Backend deve prever:

- Logs estruturados.
- Request id.
- Logs de jobs.
- Logs de integracao externa sem dados sensiveis.
- Erros acionaveis.

## Comandos de Qualidade

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @crm-novo/api build
pnpm --filter @crm-novo/web build
```
