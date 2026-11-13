# CONTINUITY1 PREPARE-ONLY — implementação e plano de piloto

## Escopo

Implementação de desenvolvimento para preparar sucessoras WhatsApp sem enviar mensagem,
criar atendimento, chamar KiraGo ou mover histórico. A operação recebe somente IDs já
classificados; os 66 casos sem cliente e os 8 casos com identidade divergente são
rejeitados pelos próprios gates e permanecem manuais.

## Contrato administrativo

### Dry-run e aplicação

`POST /whatsapp/conversation-successor-preparations/prepare`

Campos:

- `targetConnectionId`: conexão sucessora operacional;
- `batchKey`: identificador auditável do lote;
- `predecessorConversationIds`: de 1 a 25 UUIDs explícitos;
- `apply`: `false` por padrão. Quando `true`, o lote é atômico.

O dry-run retorna `ELIGIBLE`, `ALREADY_PREPARED`, `MANUAL_REVIEW` ou `CONFLICT`.
Em aplicação, qualquer resultado diferente de `PREPARED`/`ALREADY_PREPARED` interrompe
e reverte o lote inteiro. Alterações concorrentes também encerram o lote sem gravação
parcial.

### Cancelamento seguro

`POST /whatsapp/conversation-successor-preparations/:id/cancel`

Somente `PREPARED` sem mensagem, atendimento ou vínculo pode ser cancelada. A conversa
vazia é removida e o registro de auditoria permanece em `CANCELLED`, com o UUID original
preservado em snapshot. Qualquer evento real exige revisão manual.

### Outbound explicitamente confirmado

O contrato existente de envio de texto aceita
`continueOnPreparedSuccessor=true` quando o ID informado é o da predecessora. Sem essa
confirmação, qualquer envio direto à sucessora `PREPARED` é bloqueado antes do provider.
O vínculo e `ACTIVATED` somente são persistidos depois da confirmação do provider.
Falha ou resultado incerto mantém `PREPARED` sem vínculo.

No CRM, a predecessora `PREPARED` exibe um aviso persistente e exige confirmação
explícita do operador antes do primeiro texto. Anexo, resposta, figurinha, mídia e ação
sobre mensagem permanecem bloqueados nesse primeiro envio. A interface informa que a
sucessora só será ativada depois da confirmação do WhatsApp.

### Gate de automações outbound

Billing, Recovery, PIX/ativação inicial e o envio administrativo legado consultam um
guard central imediatamente antes do provider. Se o destino corresponder a uma sucessora
`PREPARED`, o provider não é chamado e o fluxo recebe
`WHATSAPP_PREPARED_SUCCESSOR_AUTOMATION_BLOCKED`. O prepare-only também recusa o lote se
já existir dispatch `PENDING`, `SCHEDULED` ou `PROCESSING` para o mesmo destino. Assim,
uma automação iniciada antes do prepare bloqueia a preparação, e uma preparação já
confirmada bloqueia a automação antes do envio.

## Estados

- `PREPARED`: sucessora vazia e oculta das filas; predecessora continua visível;
- `ACTIVATED`: primeiro inbound real ou outbound confirmado criou o vínculo na mesma
  transação local;
- `CANCELLED`: sucessora ainda vazia removida com auditoria preservada;
- `FAILED`: conflito estrutural detectado na ativação; nenhum histórico é reescrito e o
  caso passa a exigir revisão manual.

## Invariantes

- uma preparação por predecessora, uma por sucessora e uma por chave de idempotência;
- conexão de destino `CONNECTED`, `connected=true` e `loggedIn=true`;
- mesma identidade empresarial normalizada;
- cliente obrigatório e identidade telefônica compatível;
- nenhuma assistência ativa na predecessora;
- nenhuma sucessora física ou vínculo concorrente;
- nenhum dispatch outbound ativo para o mesmo destino na conexão sucessora;
- sucessora criada sem `lastMessageAt`, preview, unread, mensagens ou atendimentos;
- mensagens e atendimentos históricos permanecem na predecessora;
- nenhuma chamada de provider no prepare-only.

## Visibilidade e ativação

A listagem normal exclui apenas sucessoras cujo estado seja `PREPARED`. A predecessora
continua visível porque o vínculo ainda não existe. No primeiro inbound real, mensagem,
atendimento, vínculo e transição para `ACTIVATED` pertencem à mesma transação. No
outbound, a ativação ocorre somente após confirmação do provider.

## Plano de piloto (não autorizado para produção)

1. obter backup e preflight produtivo explicitamente autorizados;
2. aplicar a migration aditiva e implantar a API, sem preparar conversa alguma;
3. validar catálogo, health, filas existentes e ausência de registros de preparação;
4. publicar o frontend compatível, ainda sem preparar conversa alguma;
5. executar somente o dry-run dos mesmos 5 IDs do piloto;
6. exigir cinco `ELIGIBLE` ou `ALREADY_PREPARED`, sem categoria manual/conflito;
7. mediante autorização separada, aplicar lote atômico de 5;
8. validar zero mensagens, atendimentos e vínculos; predecessoras visíveis e sucessoras
   ausentes das filas;
9. observar ativações reais, sem gerar mensagem de teste;
10. somente após aprovação, repetir com 10 IDs;
11. somente após nova aprovação, usar lotes de até 25, parando no primeiro conflito.

## Rollback

- migration ainda sem dados: rollback apenas em janela explicitamente autorizada;
- `PREPARED` vazia: endpoint de cancelamento seguro;
- `ACTIVATED`, `FAILED` ou sucessora com evento: nunca apagar automaticamente;
- nenhuma estratégia de rollback move ou copia mensagens/atendimentos.

## Riscos residuais

- o bloqueio de automações é proposital e pode gerar dispatch falho/reagendado, conforme o
  contrato preexistente de Billing/Recovery; o piloto deve monitorar essas filas;
- uma automação completamente externa ao CRM não pode ser coordenada por este banco e deve
  permanecer fora do piloto;
- `FAILED` exige triagem administrativa antes de qualquer nova preparação;
- deploy requer migration aditiva e compatibilidade coordenada entre API e web;
- nenhuma contagem global fixa deve ser usada como gate: validar IDs e estados exatos;
- os dois vínculos concorrentes já existentes permanecem fora deste escopo.

## Estado

Implementado e validado somente em desenvolvimento. Sem push, merge, migration ou
deploy produtivo.
