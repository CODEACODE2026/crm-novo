# CRM Novo - Checklist de QA

## Regra Geral

QA deve validar requisito, experiencia operacional, seguranca, dados e ausencia
de regressao. Mocks nao devem ser usados como validacao final de fluxo integrado
quando backend e banco estiverem disponiveis.

## Validacoes Obrigatorias Por Sprint Tecnica

- Revisar escopo aprovado da Sprint.
- Confirmar arquivos alterados.
- Executar typecheck.
- Executar lint.
- Executar testes.
- Executar build.
- Executar `git diff --check`.
- Revisar diff.
- Verificar ausencia de secrets.
- Verificar ausencia de arquivos fora do escopo.
- Registrar riscos residuais.

## Auth

- Login com credenciais validas.
- Login com senha invalida.
- Login com usuario inexistente.
- Token ausente bloqueia rotas protegidas.
- Token invalido bloqueia rotas protegidas.
- Erro nao expoe stack trace.
- Rate limit em login quando implementado.

## Clientes

- Criar cliente com dados obrigatorios.
- Bloquear referencia duplicada.
- Buscar por referencia.
- Buscar por nome.
- Buscar por telefone.
- Normalizar telefone com formatos diferentes.
- Bloquear duplicidade por telefone normalizado.
- Editar dados principais.
- Alterar para `INATIVO` exigindo justificativa.
- Alterar para `CANCELADO` exigindo justificativa.
- Registrar evento na timeline.
- Preservar cliente com historico relevante.

## Planos

- Seeds iniciais existem.
- Criar plano.
- Editar plano.
- Desativar plano.
- Impedir uso indevido de plano inativo quando aplicavel.
- Cliente pode possuir valor diferente do valor padrao.

## Renovacoes

- Preview de renovacao mensal.
- Preview bimestral.
- Preview trimestral.
- Preview semestral.
- Preview anual.
- Renovacao em fevereiro.
- Renovacao em ano bissexto.
- Renovacao no dia 29.
- Renovacao no dia 30.
- Renovacao no dia 31.
- Mes destino sem dia equivalente usa ultimo dia valido.
- Confirmacao atualiza vencimento.
- Confirmacao cria Renewal.
- Confirmacao cria Receivable.
- Confirmacao registra ClientEvent.
- Confirmacao registra AuditLog quando aplicavel.
- Falha no financeiro desfaz alteracao de vencimento.

## Financeiro

- Listar contas a receber.
- Filtrar por periodo.
- Filtrar por cliente.
- Filtrar por status de pagamento.
- Calcular vencidos sem status persistido.
- Baixar conta a receber.
- Baixa gera ou vincula FinancialTransaction.
- Criar entrada manual.
- Criar saida manual.
- Categoria obrigatoria quando aplicavel.
- Alteracoes financeiras geram auditoria.

## Dashboard

- Indicadores de clientes batem com banco.
- Indicadores financeiros batem com banco.
- Vencimentos hoje corretos.
- Vencimentos proximos corretos.
- Vencidos calculados corretamente.
- Filtro de periodo altera os dados esperados.
- Graficos nao ocultam informacao essencial.

## Templates e Mensagens

- Template aceita variaveis permitidas.
- Template rejeita variaveis desconhecidas quando aplicavel.
- Renderizacao troca nome, primeiro nome, valor, vencimento, plano e referencia.
- Texto final e registrado no envio.

## Automacoes

- Job e criado com status correto.
- Job possui idempotency key.
- Reprocessamento nao duplica envio.
- Job revalida cliente antes de enviar.
- Job nao cobra cliente inativo.
- Job nao cobra cliente cancelado.
- Job nao cobra conta paga.
- Falha registra erro.
- Retry respeita limite.

## Recuperacao

- Inativacao pode iniciar campanha.
- Etapas 3, 10, 15 e 30 dias sao agendadas.
- Mesma etapa nao envia duas vezes.
- Renovacao cancela proximas etapas.
- Cancelamento cancela campanha.
- Eventos aparecem no historico.

## WhatsApp

Validar somente quando API real existir:

- Conexao.
- Status.
- QR Code se aplicavel.
- Telefone conectado.
- Envio.
- Erro de envio.
- Webhook.
- Contato desconhecido vira lista de espera.

## PIX

Validar somente quando API real existir:

- Geracao de PIX.
- QR Code/copia e cola.
- Expiracao.
- Webhook.
- Confirmacao.
- Baixa financeira.
- Idempotencia.

## UI

- Tema escuro consistente.
- Contraste suficiente.
- Sidebar funcional.
- Header funcional.
- Tabelas legiveis em desktop.
- Responsividade em tablet.
- Responsividade em celular.
- Formularios nao cortam texto.
- Status nao dependem apenas de cor.
- Estados vazio, loading e erro existem.

## Seguranca

- `.env.example` nao contem segredo real.
- `.env` nao versionado.
- Senhas com hash seguro.
- JWT secret obrigatorio em producao.
- CORS configuravel.
- Logs sem tokens ou secrets.
- Erros sem stack trace em producao.
- Rotas protegidas exigem autenticacao.
- Autorizacao server-side aplicada.
