# CRM Novo - Discovery

## Status

Sprint 0 - Descoberta e Arquitetura.

Este documento formaliza o entendimento inicial do produto. Nenhuma implementacao
de codigo, migration, integracao externa, commit ou push faz parte desta Sprint.

## Visao do Produto

O CRM Novo sera o sistema operacional da Code a Code para gerir clientes,
recorrencias, renovacoes, financeiro, cobrancas, recuperacao de clientes
inativos e integracoes futuras com WhatsApp e pagamentos PIX.

O sistema vai substituir futuramente um sistema legado, mas nao deve copiar sua
estrutura tecnica. O legado sera usado apenas como fonte de regras de negocio
uteis, apos analise e validacao especifica.

## Objetivo Principal

Controlar o ciclo completo do cliente:

```text
Contato pelo WhatsApp
-> Lista de espera
-> Aprovacao
-> Cliente ativo
-> Cobranca
-> Renovacao
-> Financeiro
-> Inativacao ou cancelamento
-> Recuperacao
```

## Usuarios Iniciais

- Administrador principal da Code a Code.

## Usuarios Futuros

- Operadores.
- Usuarios financeiros.
- Administradores.
- Usuarios vinculados a empresas, caso o sistema evolua para produto
  multiempresa.

## Escopo Funcional Inicial

- Login administrativo.
- Cadastro e gestao de clientes.
- Planos e periodos de recorrencia.
- Vencimentos e valores negociados por cliente.
- Status de cliente.
- Justificativa obrigatoria para inativacao e cancelamento.
- Timeline operacional no cadastro do cliente.
- Historico de renovacoes.
- Contas a receber.
- Baixa de contas a receber.
- Entradas e saidas financeiras.
- Categorias financeiras.
- Dashboard operacional e financeiro.
- Templates de mensagens.
- Estrutura futura para automacoes.
- Estrutura futura para WhatsApp.
- Estrutura futura para PIX.
- Estrutura futura para importacao do legado.

## Fora do Escopo Nesta Fase

- Integracao real com WhatsApp.
- Integracao real com PIX.
- Multiempresa completa.
- Importacao do legado.
- Central de conversas completa.
- Disparos automaticos reais sem provider aprovado.
- Commit ou push automatico.

## Fluxo Completo do Cliente

1. Um contato chega pelo WhatsApp.
2. O telefone e normalizado.
3. Se ja existir cliente com o telefone normalizado, o sistema vincula o evento
   ao cliente existente.
4. Se nao existir cliente, o sistema cria um contato pendente na lista de
   espera.
5. O administrador revisa o contato pendente.
6. Ao aprovar, o sistema preenche dados conhecidos e solicita os dados
   obrigatorios restantes.
7. O cliente e criado como ativo.
8. O cliente passa a ter plano, valor negociado, vencimento e antecedencia de
   cobranca.
9. O sistema permite renovar o cliente de forma transacional.
10. A renovacao atualiza vencimento, registra historico e cria conta a receber.
11. A baixa financeira gera ou vincula uma transacao financeira.
12. Caso o cliente seja inativado ou cancelado, a justificativa e obrigatoria.
13. Cliente inativo pode entrar em fluxo futuro de recuperacao.
14. Cliente cancelado cancela campanhas automaticas de recuperacao.

## Decisoes Aprovadas

### Decisao Agora

- Backend em Node.js, NestJS, TypeScript, Prisma ORM e PostgreSQL.
- Frontend em Next.js e TypeScript.
- API REST.
- Autenticacao com JWT.
- Monorepo como estrutura preferencial.
- `Client.reference` sera unica.
- Telefone canonico no padrao E.164 sem `+`, por exemplo `5544999999999`.
- Renovacao adiciona meses de calendario.
- Quando o dia nao existir no mes destino, usar o ultimo dia valido.
- Planos terao CRUD simples e seeds iniciais.
- Baixa de conta a receber gera ou vincula uma `FinancialTransaction`.
- Cliente `CANCELADO` cancela campanhas automaticas de recuperacao.
- `VENCIDO` sera tratado como condicao calculada nesta fase, nao como estado
  persistido desnecessario.
- `Client.dueDate`, vencimentos financeiros e datas de renovacao sao datas de
  negocio.

### Preparar Para Futuro

- Multiusuarios.
- Permissoes e papeis.
- Multiempresa.
- WhatsApp Provider real.
- Payment/Pix Provider real.
- Webhooks.
- Jobs com Redis/BullMQ, se a integracao real exigir.
- Importacao do sistema legado.
- Central de conversas.

### Nao Implementar Ainda

- WhatsApp ficticio.
- PIX ficticio.
- Multiempresa completa.
- Importacao do legado.
- Redis/BullMQ antes de necessidade concreta.
- Funcionalidades fora da Sprint aprovada.

## Principios de Produto

- Clareza operacional acima de efeito visual.
- Dados financeiros devem ser confiaveis e rastreaveis.
- Historico de negocio deve ser visivel e util para operacao.
- Auditoria deve existir para rastreabilidade administrativa, sem substituir o
  historico do cliente.
- Regras de dominio ficam no backend.
- Frontend consome exclusivamente a API.
- Integracoes externas ficam atras de providers/adapters.
- Automacoes nao ficam espalhadas em controllers.
- Nenhuma operacao critica deve deixar dados parcialmente atualizados.

## Riscos Iniciais

- Misturar automacao, WhatsApp e financeiro cedo demais.
- Persistir status calculaveis sem necessidade.
- Tratar datas de negocio como timestamps comuns.
- Criar integracoes ficticias que depois precisem ser removidas.
- Criar multiempresa prematuramente.
- Criar historico e auditoria como a mesma coisa.
- Permitir duplicidade por telefone sem normalizacao central.

## Pendencias de Decisao

- Definir se login usara JWT via header, cookie HttpOnly, ou combinacao.
- Definir estrategia exata de DateOnly no Prisma/PostgreSQL.
- Definir nomes finais das rotas REST.
- Definir se categorias financeiras iniciais serao apenas seeds ou tambem
  editaveis na primeira entrega do financeiro.
- Definir politica de arquivamento/soft delete por entidade.
