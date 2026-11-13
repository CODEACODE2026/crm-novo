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
- sucessora criada sem `lastMessageAt`, preview, unread, mensagens ou atendimentos;
- mensagens e atendimentos históricos permanecem na predecessora;
- nenhuma chamada de provider no prepare-only.

## Visibilidade e ativação

A listagem normal exclui apenas sucessoras cujo estado seja `PREPARED`. A predecessora
continua visível porque o vínculo ainda não existe. No primeiro inbound real, mensagem,
atendimento, vínculo e transição para `ACTIVATED` pertencem à mesma transação. No
outbound, a ativação ocorre somente após confirmação do provider.

## Plano de piloto (não autorizado para produção)

1. aplicar a migration aditiva em janela separada e validar o catálogo;
2. executar dry-run dos mesmos 5 IDs do piloto;
3. exigir cinco `ELIGIBLE` ou `ALREADY_PREPARED`, sem categoria manual/conflito;
4. aplicar lote atômico de 5;
5. validar zero mensagens, atendimentos e vínculos; predecessoras visíveis e sucessoras
   ausentes das filas;
6. observar ativações reais, sem gerar mensagem de teste;
7. somente após aprovação, repetir com 10 IDs;
8. somente após nova aprovação, usar lotes de até 25, parando no primeiro conflito.

## Rollback

- migration ainda sem dados: rollback apenas em janela explicitamente autorizada;
- `PREPARED` vazia: endpoint de cancelamento seguro;
- `ACTIVATED`, `FAILED` ou sucessora com evento: nunca apagar automaticamente;
- nenhuma estratégia de rollback move ou copia mensagens/atendimentos.

## Riscos residuais

- a UI ainda precisa expor a confirmação explícita de continuidade para outbound;
- fluxos outbound automatizados que não passam pela rota manual confirmada permanecem fora
  da ativação PREPARE-ONLY; o piloto deve excluir contatos com automações ativas até um gate
  específico ser aprovado, sem alterar PAYMENT2 neste escopo;
- `FAILED` exige triagem administrativa antes de qualquer nova preparação;
- deploy requer migration aditiva e compatibilidade coordenada entre API e web;
- nenhuma contagem global fixa deve ser usada como gate: validar IDs e estados exatos;
- os dois vínculos concorrentes já existentes permanecem fora deste escopo.

## Estado

Implementado e validado somente em desenvolvimento. Sem push, merge, migration ou
deploy produtivo.
