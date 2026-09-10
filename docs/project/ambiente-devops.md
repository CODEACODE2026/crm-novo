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
- `DATABASE_URL`.
- `JWT_SECRET`.
- `JWT_EXPIRES_IN`.
- `CORS_ORIGIN`.
- `BCRYPT_ROUNDS`.
- `APP_TIMEZONE=America/Sao_Paulo`.
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
- Autenticacao web deve usar JWT em cookie `HttpOnly`.
- Cookie de autenticacao deve usar `Secure` em producao e `SameSite` adequado.
- Token principal de autenticacao nao deve ser armazenado em `localStorage`.
- Refresh token fica preparado como estrategia futura, sem complexidade
  prematura na primeira entrega.
- CORS em producao deve usar allowlist.
- Login deve ter rate limit quando exposto.
- Logs nao devem expor tokens, cookies, senhas ou payloads sensiveis completos.
- Erros de producao nao devem expor stack trace.

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
