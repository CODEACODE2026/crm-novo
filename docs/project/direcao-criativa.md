# CRM Novo - Direcao Criativa UI

## Objetivo Visual

Criar uma interface administrativa moderna, escura, profissional e objetiva. A
experiencia deve priorizar clareza, velocidade de operacao e leitura confiavel
dos dados.

## Personalidade da Interface

- Profissional.
- Precisa.
- Calma.
- Densa sem parecer apertada.
- Moderna sem efeitos desnecessarios.

## Tema

Tema principal: escuro.

Diretrizes:

- Fundo escuro neutro.
- Superficies em tons ligeiramente distintos para separar areas.
- Alto contraste para texto importante.
- Cores de status usadas com consistencia.
- Evitar paleta carregada ou visual chamativo.
- Evitar gradientes decorativos excessivos.

## Layout Principal

- Sidebar lateral fixa em desktop.
- Header superior com busca, usuario e atalhos principais.
- Area principal com conteudo modular.
- Dashboard como tela operacional, nao landing page.
- Desktop como ambiente principal.
- Responsivo para tablet e celular.

## Navegacao Inicial

Itens previstos:

- Dashboard.
- Clientes.
- Lista de espera.
- Renovacoes.
- Financeiro.
- Cobrancas.
- Automacoes.
- WhatsApp.
- Pagamentos.
- Configuracoes.

Itens futuros podem aparecer desabilitados ou ocultos enquanto o modulo nao
estiver implementado.

## Componentes Essenciais

- Tabelas com filtros.
- Busca por nome, referencia e telefone.
- Cards compactos de indicadores.
- Badges de status.
- Formularios claros.
- Modais para confirmacoes criticas.
- Timeline de cliente.
- Painel de renovacao com preview de novo vencimento.
- Graficos financeiros.
- Empty states objetivos.
- Loading states discretos.
- Alertas de erro claros.

## Status Visuais

Clientes:

- `ATIVO`: positivo, verde controlado.
- `INATIVO`: atencao, amarelo/ambar controlado.
- `CANCELADO`: critico ou neutro forte, vermelho discreto ou cinza.

Financeiro:

- Pendente: azul ou cinza informativo.
- Pago: verde.
- Vencido calculado: vermelho.
- Cancelado: cinza.

Mensagens/jobs:

- Agendado: azul.
- Processando: roxo ou ciano discreto.
- Enviado: verde.
- Falhou: vermelho.
- Cancelado/Ignorado: cinza.

## Dashboard

O dashboard deve mostrar informacao acionavel:

- Clientes ativos, inativos e cancelados.
- Novos clientes no periodo.
- Clientes aguardando aprovacao.
- Renovacoes no periodo.
- Vencimentos hoje.
- Vencimentos proximos.
- Vencimentos atrasados.
- Total recebido.
- Valores pendentes.
- Valores vencidos calculados.
- Entradas.
- Saidas.
- Saldo.
- Previsao de recebimento.

Graficos previstos:

- Faturamento por mes.
- Entradas x saidas.
- Evolucao de clientes ativos.
- Renovacoes por mes.
- Inadimplencia calculada.

## Clientes

Tela de clientes deve favorecer operacao diaria:

- Busca rapida por referencia, nome e telefone.
- Filtros por status, plano e vencimento.
- Colunas principais:
  - Nome.
  - Referencia.
  - WhatsApp.
  - Status.
  - Plano.
  - Valor.
  - Vencimento.
  - Proxima acao.
- Acoes rapidas:
  - Ver.
  - Editar.
  - Renovar.
  - Inativar.
  - Cancelar.

## Cadastro do Cliente

O cadastro deve ter abas ou secoes claras:

- Dados gerais.
- Plano e recorrencia.
- Financeiro.
- Historico.
- Mensagens.
- Auditoria, se permitido.

## Renovacao

A acao de renovacao deve ter fluxo guiado:

- Mostrar vencimento atual.
- Mostrar plano atual.
- Mostrar valor atual.
- Permitir ajustes.
- Mostrar novo vencimento antes da confirmacao.
- Confirmacao final indicando que a operacao criara renovacao e conta a receber.

## Financeiro

Interface financeira deve ser precisa:

- Filtros fortes por periodo.
- Separacao clara entre contas a receber e transacoes.
- Destaque para vencidos calculados.
- Baixa manual com confirmacao.
- Saidas manuais com categoria obrigatoria.

## Responsividade

Desktop:

- Tabelas completas.
- Sidebar sempre visivel.
- Filtros laterais ou superiores.

Tablet:

- Sidebar recolhivel.
- Tabelas com colunas essenciais.

Mobile:

- Navegacao compacta.
- Cards/listas no lugar de tabelas largas.
- Acoes importantes acessiveis sem poluir a tela.

## Nao Fazer

- Nao criar landing page.
- Nao usar interface cheia de efeitos.
- Nao esconder dados operacionais em componentes decorativos.
- Nao criar textos explicativos longos dentro do app.
- Nao usar cards dentro de cards.
- Nao deixar status depender apenas de cor.
- Nao usar regra de negocio no frontend.

## REPORTS-INTELLIGENCE1-UX-REFINE1 — Direção visual

### Princípio

Mais informação útil por dobra, sem transformar o painel em uma interface apertada. O refinamento mantém a personalidade premium, calma e precisa já aprovada.

### Gráficos

- Reduzir espaço morto entre descrição e plotagem.
- Usar canvas com altura responsiva menor, porém com plotagem interna maior.
- Diminuir margens Recharts e reservar espaço explícito para legenda.
- Manter fontes de eixos legíveis e reduzir densidade de ticks quando necessário.
- Marcar o último bucket em andamento como `parcial` no contexto do painel e no rótulo/tooltip, sem mudar o valor.

### KPIs

- Cards mais baixos e consistentes.
- Valor principal com contraste e escala maiores que descrição e badge.
- Descrições com tamanho mínimo legível e até duas linhas.
- Comparação sem base deve usar linguagem neutra (`Novo no período`), nunca percentual fictício.

### Mobile

- Presets em trilho horizontal compacto com snap e seleção visível.
- Navegação das seções compacta, também horizontal, preservando os quatro destinos.
- KPIs em duas colunas sempre que a largura permitir; uma coluna apenas abaixo de 360 px.
- Gráficos em coluna única, com altura suficiente para leitura e sem canvas desproporcional.
- Hero e resumo do período devem priorizar o acesso rápido aos indicadores.

### Medidas-alvo

- Hero desktop: padding aproximado de 20–22 px; mobile: 14–16 px.
- KPI desktop: 142–154 px; mobile: 132–144 px.
- Card de gráfico desktop: 300–330 px; mobile: 286–310 px.
- Canvas de gráfico: 210–240 px conforme viewport e presença de legenda.
