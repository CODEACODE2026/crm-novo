# CRM Novo - Backlog Tecnico

## Regra de Execucao

Cada tarefa deve ser pequena, homologavel e executada somente apos aprovacao.
Nao fazer commit ou push sem autorizacao explicita.

## Sprint 0 - Descoberta e Arquitetura

Status: em formalizacao documental.

- Criar `discovery.md`.
- Criar `master-prompt.md`.
- Criar `requisitos.md`.
- Criar `arquitetura.md`.
- Criar `direcao-criativa.md`.
- Criar backlog tecnico.
- Criar checklist de QA.
- Criar orientacao inicial de ambiente/devops.
- Revisar consistencia dos documentos.

## Sprint 1 - Fundacao

Objetivo: criar base tecnica sem funcionalidades de negocio complexas.

Decisoes aprovadas:

- Monorepo com `pnpm`.
- Git inicializado na Sprint 1.
- `apps/api`, `apps/web` e `packages/shared`.
- PostgreSQL e Prisma.
- TypeScript strict.
- ESLint e Prettier.
- JWT em cookie `HttpOnly`, com `Secure` em producao.
- Sem token principal em `localStorage`.
- Sem Redis/BullMQ nesta Sprint.

Tarefas pequenas:

1. Criar estrutura do monorepo.
2. Configurar workspace/package manager.
3. Criar app NestJS em `apps/api`.
4. Criar app Next.js em `apps/web`.
5. Configurar TypeScript strict.
6. Configurar lint/format.
7. Configurar Prisma e PostgreSQL dev.
8. Criar `.env.example` sem segredos.
9. Criar modulo Auth.
10. Criar modelo User inicial.
11. Criar seed seguro para usuario admin inicial.
12. Criar login JWT.
13. Criar guard de autenticacao.
14. Criar layout administrativo base no frontend.
15. Criar tela de login.
16. Integrar login frontend/API.
17. Criar healthcheck da API.
18. Rodar typecheck, lint, tests e build.

## Sprint 2 - Clientes e Planos

Objetivo: operar cadastro basico de clientes e planos.

Tarefas pequenas:

1. Criar schema de Plan.
2. Criar seeds de planos iniciais.
3. Criar CRUD de planos.
4. Criar schema de Client.
5. Implementar normalizacao central de telefone.
6. Testar normalizacao de telefone.
7. Implementar criacao de cliente.
8. Implementar edicao de cliente.
9. Implementar listagem com filtros.
10. Implementar busca por referencia, nome e telefone.
11. Implementar unicidade de referencia.
12. Implementar unicidade de telefone normalizado.
13. Implementar mudanca de status com justificativa.
14. Criar ClientEvent basico.
15. Criar timeline no frontend.
16. Validar responsividade das tabelas.

## Sprint 3 - Renovacao

Objetivo: renovar cliente com transacao e geracao de conta a receber.

Tarefas pequenas:

1. Implementar utilitario de adicao de meses calendario.
2. Testar mensal, bimestral, trimestral, semestral e anual.
3. Testar fim de mes, fevereiro e ano bissexto.
4. Criar schema de Renewal.
5. Criar schema de Receivable.
6. Criar endpoint de preview de renovacao.
7. Criar endpoint de confirmacao transacional.
8. Registrar ClientEvent de renovacao.
9. Registrar AuditLog quando aplicavel.
10. Criar UI de renovar cliente.
11. Criar historico de renovacoes no cliente.
12. Validar rollback transacional em falha simulada.

## Sprint 4 - Financeiro

Objetivo: controlar contas a receber e transacoes financeiras.

Tarefas pequenas:

1. Criar FinancialCategory.
2. Criar seeds de categorias iniciais.
3. Criar FinancialTransaction.
4. Listar contas a receber.
5. Filtrar contas por periodo, cliente e status.
6. Calcular vencidos sem persistir `VENCIDO`.
7. Implementar baixa de conta a receber.
8. Vincular baixa a FinancialTransaction.
9. Implementar entrada manual.
10. Implementar saida manual.
11. Criar telas financeiras.
12. Auditar baixa manual e alteracoes financeiras.

## Sprint 5 - Dashboard

Objetivo: entregar visao operacional e financeira.

Tarefas pequenas:

1. Criar agregacoes de clientes.
2. Criar agregacoes de renovacoes.
3. Criar agregacoes financeiras.
4. Criar agregacoes de vencimentos.
5. Criar endpoint de dashboard.
6. Criar cards de indicadores.
7. Criar graficos iniciais.
8. Criar filtros de periodo.
9. Validar performance das consultas.

## Sprint 6 - WhatsApp Base

Condicao: iniciar apenas apos usuario fornecer API real.

Tarefas pequenas:

1. Analisar documentacao/payloads reais.
2. Definir adapter/provider.
3. Criar WhatsAppConnection.
4. Criar tela de conexao.
5. Implementar status da conexao.
6. Implementar envio conforme API real.
7. Implementar webhook conforme API real.
8. Registrar MessageDispatch.

## Sprint 7 - Lista de Espera

Objetivo: transformar contatos desconhecidos em pendencias aprovaveis.

Tarefas pequenas:

1. Criar WhatsAppPendingContact.
2. Criar regra de identificacao por telefone normalizado.
3. Criar listagem de contatos pendentes.
4. Criar tela de aprovacao.
5. Criar conversao para cliente.
6. Vincular contato aprovado ao cliente.
7. Registrar ClientEvent.
8. Impedir duplicidade.

## Sprint 8 - Cobranca Automatica

Objetivo: preparar envio seguro de cobrancas.

Tarefas pequenas:

1. Criar MessageTemplate.
2. Criar renderizador de template.
3. Validar variaveis permitidas.
4. Criar AutomationJob.
5. Criar agendamento de cobranca.
6. Criar idempotency key de cobranca.
7. Criar processador seguro.
8. Revalidar cliente e conta antes de enviar.
9. Registrar tentativa em MessageDispatch.
10. Evitar duplicidade apos reinicializacao.

## Sprint 9 - Recuperacao

Objetivo: recuperar clientes inativos com campanhas controladas.

Tarefas pequenas:

1. Criar RecoveryCampaign.
2. Criar RecoveryStep.
3. Agendar etapas 3, 10, 15 e 30 dias.
4. Criar templates por etapa.
5. Cancelar etapas ao renovar.
6. Cancelar campanhas ao cancelar cliente.
7. Garantir idempotencia por etapa.
8. Registrar ClientEvent de recuperacao.

## Sprint 10 - PIX

Condicao: iniciar apenas apos usuario fornecer API real.

Tarefas pequenas:

1. Analisar documentacao real.
2. Definir PaymentProvider.
3. Criar PaymentIntent.
4. Gerar PIX via provider real.
5. Registrar payloads essenciais.
6. Processar webhook.
7. Confirmar pagamento.
8. Baixar conta a receber.

## Sprint 11 - Importacao do Legado

Condicao: iniciar apenas apos sistema homologado e dados fornecidos.

Tarefas pequenas:

1. Analisar estrutura do legado.
2. Criar mapeamento de campos.
3. Criar normalizacao de telefone.
4. Detectar duplicidades.
5. Validar plano, vencimento e valor.
6. Gerar relatorio de inconsistencias.
7. Executar importacao de teste.
8. Conferir totais.
9. Solicitar aprovacao para importacao definitiva.
