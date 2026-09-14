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
- O body parser da rota usa limite dedicado de `32kb`.
- Eventos irrelevantes, grupos, mensagens enviadas por mim e mensagens sem telefone real retornam sucesso operacional com motivo de ignorado.
- O payload bruto da Kirago nao e persistido; somente campos normalizados e metadata minima de midia sao gravados.
- A configuracao direta usa a API de instancia Kirago: `POST /webhook`, header `token`, body `{ webhook, events, active: true }`.
- `CRM_API_PUBLIC_URL` deve apontar para uma URL publica HTTPS; localhost, HTTP e IP privado sao recusados para registro externo.
- A integracao Kirago v1.11 em uso neste projeto nao possui contrato local documentado de assinatura, secret ou HMAC para webhook recebido. Sem esse contrato, o CRM nao inventa validacao inexistente; a protecao fica em limite de payload, normalizacao defensiva, aceite apenas de eventos esperados, erros sanitizados e idempotencia de banco.
- A integracao Kirago v1.11 em uso neste projeto normaliza respostas de botao/lista quando chegarem no webhook, mas nao ha contrato local comprovado para envio de botoes interativos. Por isso, respostas de cobranca usam fallback textual controlado: `1 - Sim, quero renovar` e `2 - Nao quero renovar`.

## Envio manual

- O detalhe do cliente permite envio manual de texto.
- Backend valida cliente, telefone, conexao operacional, mensagem e token descriptografavel.
- `MessageDispatch.requestId` protege contra repeticao da mesma intencao.
- Se Kirago aceitar `Id`, o CRM envia o proprio `requestId`.
- Em sucesso: `MessageDispatch` fica `SENT` e a timeline recebe evento compacto.
- Em falha: `MessageDispatch` fica `FAILED` com erro sanitizado.

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

## Debito Operacional

- Homologacao com webhook Kirago real permanece pendente para o ambiente Windows, quando `KIRAGO_ADMIN_TOKEN` e demais envs reais forem configurados.
