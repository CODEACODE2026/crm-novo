# WhatsApp Kirago

Sprint 6 adiciona a base de WhatsApp do CRM Novo usando Kirago como provider atual.

## Providers e tokens

- `KIRAGO_ADMIN_TOKEN` fica somente no backend e deve ser usado apenas em rotas `/admin/*`.
- Endpoints operacionais da Kirago usam o token da instancia no header `token`.
- O token da instancia e gerado pelo CRM, criptografado com `WHATSAPP_TOKEN_ENCRYPTION_KEY` e salvo em `WhatsAppConnection.providerTokenEncrypted`.
- Tokens, headers de autenticacao, QR Code completo e chave de criptografia nao devem aparecer em logs, DTOs ou respostas publicas.

## Variaveis

- `KIRAGO_BASE_URL`: URL base da Kirago.
- `KIRAGO_ADMIN_TOKEN`: token admin Kirago.
- `KIRAGO_WEBHOOK_TOKEN`: token forte anexado pelo CRM a URL configurada do
  webhook e validado em todo POST recebido em `/whatsapp/webhook/kirago`.
- `KIRAGO_HTTP_TIMEOUT_MS`: timeout das chamadas HTTP.
- `CRM_API_PUBLIC_URL`: URL publica da API do CRM para webhook.
- `WHATSAPP_TOKEN_ENCRYPTION_KEY`: chave de 32 bytes para AES-256-GCM.

## Fluxos

1. Usuario cria uma conexao pelo CRM.
2. Backend gera token forte da instancia.
3. Backend chama `POST /admin/users` com header `Authorization`.
4. CRM salva conexao local com token criptografado.
5. Operacoes seguintes usam header `token` com o token descriptografado em memoria.

## QR e status

- `POST /session/connect` inicia a conexao assinando apenas `Message`.
- `GET /session/qr` busca QR sob demanda.
- QR Code nao e persistido.
- Frontend faz polling local enquanto o modal de QR esta aberto.
- Estado interno exposto ao frontend: `DISCONNECTED`, `CONNECTING`, `QR_REQUIRED`, `CONNECTED`, `ERROR`.

## Webhook

- Endpoint publico do CRM: `POST /whatsapp/webhook/kirago`.
- O endpoint nao exige JWT do usuario do CRM.
- O body parser da rota usa limite dedicado de `8mb` para aceitar payloads JSON de midia
  da Kirago sem ampliar os demais endpoints.
- Eventos irrelevantes, grupos, mensagens enviadas por mim e mensagens sem telefone real retornam sucesso operacional com motivo de ignorado.
- O payload bruto da Kirago nao e persistido; somente campos normalizados e metadata minima de midia sao gravados.
- A configuracao direta usa a API de instancia Kirago: `POST /webhook`, header `token`, body `{ webhook, events, active: true }`.
- `CRM_API_PUBLIC_URL` deve apontar para uma URL publica HTTPS; localhost, HTTP e IP privado sao recusados para registro externo.
- A integracao Kirago v1.11 em uso neste projeto nao possui contrato local
  documentado de assinatura, secret ou HMAC para webhook recebido. Como a API
  permite configurar a URL do webhook, o CRM inclui um token forte na URL
  registrada e rejeita requests sem token valido antes de normalizar ou gravar
  eventos.
- Como esse token pode trafegar em query string por compatibilidade com a
  Kirago v1.11, o Nginx/reverse proxy nao deve registrar a query completa desse
  endpoint em access logs. Preferir logging sem `$args`/`$request_uri` para
  `/whatsapp/webhook/kirago`, ou mascarar `kirago_webhook_token`.

## Envio manual

- O detalhe do cliente permite envio manual de texto.
- Backend valida cliente, telefone, conexao operacional, mensagem e token descriptografavel.
- `MessageDispatch.requestId` protege contra repeticao da mesma intencao.
- Se Kirago aceitar `Id`, o CRM envia o proprio `requestId`.
- Em sucesso: `MessageDispatch` fica `SENT` e a timeline recebe evento compacto.
- Em falha: `MessageDispatch` fica `FAILED` com erro sanitizado.

## Midia outbound do CRM

- Para midias recebidas, o CRM preserva o fluxo existente: metadata da Kirago
  em `rawMetadata.mediaDownload` e download posterior pela propria Kirago.
- Para midias enviadas pelo endpoint
  `POST /whatsapp/conversations/:id/media`, a Kirago nao retorna metadata
  suficiente para recuperacao futura. Depois do envio aceito, a API grava uma
  copia privada local em `WHATSAPP_MEDIA_STORAGE_DIR`.
- O metadata publico nao expoe path absoluto nem storage key. Internamente,
  `WhatsAppMessage.rawMetadata.localMedia` guarda apenas `storageKey`,
  `mimeType` e `sizeBytes`.
- O endpoint autenticado
  `GET /whatsapp/conversations/:conversationId/messages/:messageId/media`
  tenta primeiro a midia local privada e, se ela nao existir, usa o fallback
  Kirago quando `mediaDownload` estiver disponivel.
- Arquivos antigos enviados pelo CRM antes desse storage continuam
  indisponiveis quando nao tiverem `mediaDownload`.

## Gravacao de voz AUDIO4

- AUDIO4 foi homologado com sucesso em producao para voice note WhatsApp:
  Chrome Desktop/`MediaRecorder` -> WebM/Opus ->
  `POST /whatsapp/conversations/:conversationId/voice` -> ffmpeg -> OGG/Opus
  -> Kirago -> `PTT=true` -> WhatsApp com playback OK.
- Chrome Desktop grava voz no navegador como WebM/Opus via `MediaRecorder`.
- WebM/Opus nao deve ser enviado diretamente para a Kirago como voice note:
  homologacao real retornou HTTP 200, mas a mensagem nao foi entregue no
  WhatsApp.
- O formato final para voice note e OGG/Opus, enviado para
  `/chat/send/audio` com `PTT=true` e `MimeType=audio/ogg; codecs=opus`.
- A conversao WebM/Opus -> OGG/Opus usa `WHATSAPP_FFMPEG_PATH` e temporarios
  privados em `WHATSAPP_VOICE_TEMP_DIR`.
- Limites do MVP homologado: input WebM maximo 5 MB, duracao real maxima 60s,
  output OGG maximo 5 MB, timeout ffmpeg 15s e uma conversao simultanea por
  processo.
- Producao homologada usa ffmpeg 4.2.7 em `/usr/bin/ffmpeg` e ffprobe em
  `/usr/bin/ffprobe`.
- O capability check exige: executavel ffmpeg, executavel ffprobe, encoder
  `libopus`, decoder Opus (`opus` ou `libopus`), demuxer WebM/Matroska e muxer
  OGG.
- O servico de conversao nunca usa nomes de arquivo do usuario, nao persiste
  Base64, nao loga conteudo de audio e remove temporarios em sucesso, erro e
  timeout.
- Backend AUDIO4B expoe um caminho separado para voice note:
  `POST /whatsapp/conversations/:conversationId/voice`. Esse endpoint aceita
  somente `multipart/form-data` com campo `file` em `audio/webm` ou
  `audio/webm; codecs=opus`, converte para OGG/Opus, persiste somente o OGG
  final no storage privado e envia pela Kirago com `PTT=true`.
- Upload comum de arquivo de audio continua no endpoint generico de midia com
  `PTT=false` para OGG, MP3 e MP4/M4A. WebM permanece recusado nesse endpoint
  para evitar tratar gravacao temporaria como midia final.
- Temporarios de conversao ficam em `WHATSAPP_VOICE_TEMP_DIR` e sao removidos
  apos sucesso, erro ou timeout. O storage permanente de midias WhatsApp deve
  ser `WHATSAPP_MEDIA_STORAGE_DIR`, por exemplo
  `/var/lib/crm-novo/whatsapp-media`; nao usar `apps/api/storage` como storage
  real de producao.

## Sprint 7 - Lista de Espera

- O webhook `POST /whatsapp/webhook/kirago` processa somente eventos `Message`.
- O payload bruto da Kirago e normalizado pelo adapter `KiragoWebhookNormalizer`.
- Mensagens de grupo, mensagens enviadas pelo proprio CRM/WhatsApp e eventos sem telefone real sao aceitos sem criar pendencia.
- `WhatsAppInboundMessage` guarda rastreabilidade minima e idempotencia por `whatsAppConnectionId + providerMessageId`.
- `WhatsAppPendingContact` representa um contato logico por `whatsAppConnectionId + phoneNormalized`.
- Contatos desconhecidos criam ou atualizam entrada `PENDENTE` na Lista de Espera.
- Telefones ja vinculados a clientes `ATIVO`, `INATIVO` ou `CANCELADO` nao criam contato pendente.
- A aprovacao cria cliente em transacao, vincula o contato pendente e registra evento operacional no historico do cliente.
- A Sprint 7 nao implementa chat completo, download de midia, resposta automatica, cobranca, recuperacao, PIX, Redis/BullMQ, Chatwoot, Typebot, grupos ou multiempresa.

## CHAT3-RT1 - Realtime do Inbox

- O Inbox usa SSE autenticado em `GET /whatsapp/events`, protegido pelos
  mesmos `JwtAuthGuard` e `AdminGuard` das rotas operacionais.
- A autenticacao usa o cookie `crm_novo_auth`; `EventSource` e criado no
  frontend com `withCredentials: true`.
- Eventos internos sao emitidos somente depois da persistencia concluida:
  `message.created`, `message.updated` e `conversation.updated`.
- O payload do SSE e minimo: tipo, `conversationId`, `messageId` quando
  aplicavel e `occurredAt`. Nao trafega corpo de mensagem, telefone, midia,
  Base64, token ou metadados sensiveis.
- O frontend trata eventos carregando silenciosamente a lista e, quando o
  evento pertence a conversa aberta, recarregando a pagina atual de mensagens
  com o merge existente por `id`.
- O polling permanece como fallback. Com SSE conectado, lista e conversa aberta
  usam intervalos maiores; com SSE desconectado, voltam aos intervalos
  historicos de 10s e 4s.
- A implementacao e single-process em memoria. Se producao passar a ter
  multiplas replicas/processos, usar Redis pub/sub ou mecanismo equivalente
  para que webhook e cliente SSE recebam eventos entre processos.

## Debito Operacional

- Homologacao com webhook Kirago real permanece pendente para o ambiente Windows, quando `KIRAGO_ADMIN_TOKEN` e demais envs reais forem configurados.
