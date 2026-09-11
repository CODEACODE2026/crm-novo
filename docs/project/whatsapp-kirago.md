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
- Nesta Sprint o webhook valida payload basico, identifica evento quando possivel e responde rapido.
- Nao cria cliente, nao cria lista de espera, nao dispara cobranca e nao executa automacao.
- Arquitetura permite adicionar HMAC quando o contrato real for definido.

## Envio manual

- O detalhe do cliente permite envio manual de texto.
- Backend valida cliente, telefone, conexao operacional, mensagem e token descriptografavel.
- `MessageDispatch.requestId` protege contra repeticao da mesma intencao.
- Se Kirago aceitar `Id`, o CRM envia o proprio `requestId`.
- Em sucesso: `MessageDispatch` fica `SENT` e a timeline recebe evento compacto.
- Em falha: `MessageDispatch` fica `FAILED` com erro sanitizado.
