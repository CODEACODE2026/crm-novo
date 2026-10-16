# Atendimentos WhatsApp

## Conversation x Attendance

`WhatsAppConversation` é o canal persistente com o contato. `WhatsAppAttendance` é um episódio de
atendimento iniciado por uma mensagem inbound real. Uma conversa pode ter muitos atendimentos,
mas apenas um `PENDING` ou `IN_PROGRESS` por vez.

Não há backfill: a captura começa após a migration desta feature.

## Abertura e contadores

- Uma mensagem inbound nova abre um atendimento `PENDING` quando não existe atendimento ativo.
- Inbounds adicionais são vinculados ao atendimento ativo e incrementam `inboundMessagesCount`.
- Outbounds, auto-reply, billing, recovery, scheduler, echoes e retries não abrem atendimento.
- Texto, mídia, áudio, sticker e forward manuais contam como resposta humana somente depois da
  confirmação do provider. A primeira muda `PENDING` para `IN_PROGRESS` e fixa
  `firstAgentReplyAt`; respostas seguintes não sobrescrevem o timestamp.
- Mensagens automáticas não incrementam `outboundMessagesCount`.

Cada `WhatsAppMessage` novo do episódio recebe `attendanceId`. Mensagens históricas continuam com
o campo nulo.

## Janela de cortesia

`ATTENDANCE_RESOLUTION_GRACE_MINUTES = 15`. Um inbound recebido antes de completar 15 minutos após
a resolução é vinculado ao atendimento resolvido e não o reabre. A partir de 15 minutos, inclusive,
um novo inbound cria outro atendimento `PENDING`.

## Resolução

Um atendimento ativo só pode ser resolvido com categoria ativa da mesma conexão. A transação grava
`RESOLVED`, `resolvedAt`, `categoryId`, observação opcional e o usuário autenticado, além de manter o
status existente da conversa consistente. Conversas legadas sem atendimento continuam podendo ser
resolvidas sem criar histórico falso.

## Categorias

As categorias padrão são criadas de forma idempotente por conexão na primeira leitura da API, sem
IDs fixos. Nome é normalizado com NFKC, trim/espaços e lowercase `pt-BR`. Categoria usada é apenas
desativada; histórico nunca perde a referência.

## API

- `GET/POST /whatsapp/connections/:connectionId/attendance-categories`
- `PATCH/DELETE /whatsapp/connections/:connectionId/attendance-categories/:categoryId`
- `GET /whatsapp/conversations/:id/attendance`
- `GET /whatsapp/conversations/:id/attendances?page=&limit=`
- `GET /whatsapp/clients/:clientId/attendances?page=&limit=`
- `GET /whatsapp/attendances/:id`
- `POST /whatsapp/conversations/:id/resolve`

Datas são persistidas em UTC. A interface apresenta datas em `America/Sao_Paulo`; tempos de
primeira resposta e resolução são derivados dos timestamps, não persistidos como duração.

## Migration

`20261016013000_add_whatsapp_attendances` cria tabelas, FKs e índices de consulta, adiciona
`attendanceId` nullable a mensagens e usa índice parcial único para impedir dois atendimentos ativos
por conversa. A migration não altera nem cria atendimentos para mensagens antigas.
