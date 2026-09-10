# CRM Novo - Requisitos

## Requisitos Funcionais

### Autenticacao

- O sistema deve possuir login.
- A V1 pode iniciar com uma conta administrativa.
- A arquitetura deve permitir multiplos usuarios, permissoes e papeis no futuro.
- Multiempresa nao deve ser implementada agora.

### Clientes

- O sistema deve permitir cadastrar, listar, visualizar, editar e filtrar
  clientes.
- Cada cliente deve possuir:
  - ID interno.
  - Nome.
  - Telefone/WhatsApp.
  - Telefone normalizado.
  - E-mail.
  - Referencia unica.
  - Observacao.
  - Status.
  - Plano.
  - Valor da recorrencia.
  - Data de vencimento.
  - Dias de antecedencia da cobranca.
  - Data de criacao.
  - Data de atualizacao.
- A referencia deve ser facilmente pesquisavel.
- O telefone normalizado deve evitar duplicidades.

### Status de Clientes

- Estados iniciais:
  - `ATIVO`.
  - `INATIVO`.
  - `CANCELADO`.
- Mudanca para `INATIVO` exige justificativa.
- Mudanca para `CANCELADO` exige justificativa.
- A justificativa deve permanecer no historico do cliente.
- Clientes com historico financeiro ou operacional relevante nao devem ser
  apagados fisicamente.

### Historico do Cliente

- O sistema deve exibir uma timeline no cadastro do cliente.
- Eventos relevantes:
  - Cadastro.
  - Alteracao importante.
  - Renovacao.
  - Pagamento.
  - Mudanca de plano.
  - Mudanca de vencimento.
  - Ativacao.
  - Inativacao.
  - Cancelamento.
  - Justificativa.
  - Envio de cobranca.
  - Mensagem de recuperacao.
  - Geracao de PIX futura.
  - Recebimento de pagamento.
  - Acoes manuais.
- Historico de cliente nao deve depender apenas de logs tecnicos.

### Planos

- O sistema deve permitir CRUD simples de planos.
- Seeds iniciais:
  - Mensal, com 1 mes.
  - Bimestral, com 2 meses.
  - Trimestral, com 3 meses.
  - Semestral, com 6 meses.
  - Anual, com 12 meses.
- Plano deve possuir:
  - Nome.
  - Quantidade de meses.
  - Valor padrao.
  - Ativo.
- Cliente pode ter valor negociado diferente do valor padrao.

### Renovacoes

- O cadastro do cliente deve possuir acao `Renovar cliente`.
- Antes de confirmar, o sistema deve exibir:
  - Plano atual.
  - Vencimento atual.
  - Valor.
  - Novo vencimento previsto.
- O usuario pode confirmar ou alterar informacoes permitidas.
- Ao confirmar, o sistema deve:
  - Atualizar vencimento do cliente.
  - Manter ou alterar cliente para `ATIVO`.
  - Criar registro de renovacao.
  - Criar conta a receber.
  - Registrar evento no historico.
  - Registrar auditoria quando aplicavel.
- A operacao deve ser transacional.

### Contas a Receber

- Toda renovacao deve poder gerar uma conta a receber.
- Conta a receber deve possuir:
  - Cliente.
  - Renovacao relacionada.
  - Descricao.
  - Valor.
  - Vencimento.
  - Status de pagamento.
  - Data de pagamento.
  - Meio de pagamento.
  - Identificador de transacao.
  - PIX relacionado futuramente.
  - Observacoes.
- `VENCIDO` deve ser condicao calculada nesta fase, baseada em vencimento e
  ausencia de pagamento.

### Financeiro Geral

- O sistema deve possuir area `Financeiro`.
- Deve incluir:
  - Contas a receber.
  - Recebimentos.
  - Entradas manuais.
  - Saidas manuais.
  - Categorias.
  - Filtros por periodo, cliente, categoria e status.
- Baixa de conta a receber deve gerar ou vincular uma `FinancialTransaction`.

### Dashboard

- O dashboard deve exibir:
  - Clientes ativos.
  - Clientes inativos.
  - Clientes cancelados.
  - Novos clientes no periodo.
  - Renovacoes no periodo.
  - Clientes aguardando aprovacao.
  - Contas a receber.
  - Total recebido.
  - Valores pendentes.
  - Valores vencidos calculados.
  - Entradas.
  - Saidas.
  - Saldo.
  - Previsao de recebimento.
  - Vencimentos hoje.
  - Vencimentos proximos.
  - Vencidos.
  - Clientes nao renovados.

### Templates de Mensagens

- O sistema deve permitir templates configuraveis.
- Variaveis previstas:
  - `{{nome}}`.
  - `{{primeiroNome}}`.
  - `{{valor}}`.
  - `{{vencimento}}`.
  - `{{plano}}`.
  - `{{referencia}}`.

### WhatsApp Futuro

- O sistema deve prever area `WhatsApp / Conexao`.
- A implementacao real depende de API futura fornecida pelo usuario.
- Nao devem ser inventados endpoints, payloads ou providers reais.

### Lista de Espera

- Mensagem de numero desconhecido deve criar contato pendente.
- Contato pendente nao vira cliente automaticamente.
- A aprovacao deve preencher dados conhecidos e exigir campos obrigatorios.
- A aprovacao deve vincular o contato original ao cliente criado.

### Recuperacao de Clientes

- Cliente inativo pode ser marcado para tentativa de recuperacao.
- Etapas iniciais previstas: 3, 10, 15 e 30 dias.
- Renovacao antes do proximo disparo cancela etapas futuras.
- Cliente cancelado cancela campanhas automaticas.
- A mesma etapa nao pode ser enviada duas vezes.

### Auditoria

- Operacoes criticas devem gerar auditoria:
  - Alteracao de vencimento.
  - Renovacao.
  - Alteracao de valor.
  - Alteracao de plano.
  - Cancelamento.
  - Inativacao.
  - Exclusoes permitidas.
  - Alteracoes financeiras.
  - Baixa manual.

## Requisitos Nao Funcionais

- TypeScript strict sempre que possivel.
- Arquitetura modular.
- DTOs e validacao server-side.
- Erros padronizados.
- Logs estruturados.
- Sem segredo no Git.
- Migrations versionadas.
- Testes em regras criticas.
- Interface responsiva.
- Tema escuro profissional.
- Tabelas e formularios eficientes para desktop.
- Preparacao para crescimento sem complexidade prematura.

## Requisitos de Seguranca

- Senha com hash seguro.
- JWT com segredo forte.
- Guards no backend.
- Autorizacao server-side.
- Rate limit em login e rotas sensiveis quando aplicavel.
- CORS configuravel.
- Variaveis de ambiente.
- Logs sem secrets ou PII desnecessaria.
- Erros sem stack trace em producao.
