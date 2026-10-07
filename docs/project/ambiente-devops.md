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
  voz. Em producao homologada, usar
  `/var/lib/crm-novo/whatsapp-media/tmp/audio4`, com owner `crmnovo:crmnovo`,
  permissao `0700` e arquivos temporarios `0600`.
  O WebM recebido pelo endpoint de voice note e temporario; o storage
  permanente guarda somente o OGG/Opus final em `WHATSAPP_MEDIA_STORAGE_DIR`.
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
- Criar o diretorio temporario de voice note
  `/var/lib/crm-novo/whatsapp-media/tmp/audio4` com owner `crmnovo:crmnovo` e
  permissao `0700`. Temporarios de conversao sao removidos pela API apos
  sucesso, erro ou timeout.

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

Voice notes AUDIO4 usam storage permanente em `WHATSAPP_MEDIA_STORAGE_DIR`
depois da conversao para OGG/Opus. Nao usar `apps/api/storage` como storage
real de producao.

Politica atual:

- Arquivos permanecem enquanto a mensagem existir.
- Nao ha limpeza automatica nesta tarefa.
- Pendencias futuras: politica de retencao, limpeza de orfaos, quota e metricas
  de uso de disco.
- Exclusao/cascade de mensagens ou conversas nao deve remover arquivos sem
  analise e regra aprovada.

## Voice Note AUDIO4 em Producao

Homologacao de producao confirmada:

- Chrome Desktop/`MediaRecorder` grava WebM/Opus.
- API recebe `POST /whatsapp/conversations/:conversationId/voice`.
- ffmpeg converte WebM/Opus para OGG/Opus.
- Kirago recebe audio com `PTT=true`.
- WhatsApp entrega como voice note com playback OK.

Requisitos de runtime:

- ffmpeg instalado via apt e disponivel em `/usr/bin/ffmpeg`.
- ffprobe disponivel em `/usr/bin/ffprobe`.
- ffmpeg 4.2.7 compativel.
- encoder `libopus` disponivel.
- decoder Opus disponivel como `opus` ou `libopus`.
- demuxer `matroska,webm` disponivel.
- muxer `ogg` disponivel.
- `WHATSAPP_FFMPEG_PATH=/usr/bin/ffmpeg`.
- `WHATSAPP_VOICE_TEMP_DIR=/var/lib/crm-novo/whatsapp-media/tmp/audio4`.
- diretorio temporario com owner `crmnovo:crmnovo` e permissao `0700`.

O capability check da API deve reportar:

```text
voice conversion available=true ffmpeg=true ffprobe=true encoderLibopus=true decoderOpus=true demuxWebm=true muxOgg=true
```

## Nota de Deploy API

Apos atualizar codigo da API em producao:

1. Rodar `prisma generate` no artefato/ambiente de build usado pela API.
2. Rebuildar a API.
3. Garantir que `dist` foi regenerado a partir do source atualizado.
4. Reiniciar `crm-novo-api.service`.

Source atualizado com `dist` antigo pode manter codigo antigo em execucao,
incluindo capability checks ou fluxos de conversao anteriores.

## Nginx para SSE do Inbox WhatsApp

O endpoint `GET /whatsapp/events` usa Server-Sent Events e precisa manter a
conexao HTTP aberta. Se a configuracao atual ja faz proxy generico para a API,
preferir o menor ajuste possivel nesse location ou em um location especifico:

```nginx
location /whatsapp/events {
  proxy_pass http://127.0.0.1:3001;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header Connection '';
  proxy_buffering off;
  proxy_cache off;
  proxy_read_timeout 3600s;
}
```

Nao usar `proxy_buffering on` nesse endpoint. O backend tambem envia
`X-Accel-Buffering: no` e heartbeat SSE a cada 25s.

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
