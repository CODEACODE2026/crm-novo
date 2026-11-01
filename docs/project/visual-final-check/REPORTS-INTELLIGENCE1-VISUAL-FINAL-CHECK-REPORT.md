# REPORTS-INTELLIGENCE1-VISUAL-FINAL-CHECK — REPORT

## 1. Escopo e ambiente

- Baseline: `3749444ddbd6708f9b9175fdd73b8e489d7c5aaf`.
- Tree do baseline: `6490db9ed3554891e46bc3c6915df83546b05db4`.
- Branch isolada: `feature/reports-intelligence1-visual-final-check`.
- Chromium real controlado por Playwright/CDP.
- API e web locais em `127.0.0.1`; PostgreSQL 12.22 isolado com 56 migrations previamente aplicadas.
- Fixture fictícia: 10 clientes, 10 referências ativas, uma referência cancelada e 41 lançamentos financeiros.
- Produção, provedores financeiros, Billing, Recovery, PIX, WhatsApp e automações não foram acessados.

## 2. Finding — gráficos do Financeiro aparentemente vazios

**Causa confirmada:** timing da captura, não inconsistência de dados ou renderização persistente.

A screenshot anterior foi obtida enquanto os elementos do Recharts ainda estavam sob animação de entrada. O QA direcionado aguardou 2,5 segundos após a remoção do skeleton e confirmou:

- seis gráficos do Financeiro renderizados;
- payload com `R$ 6.695,00` recebidos, `R$ 6.150,00` operacionais e 11 buckets mensais;
- área da evolução com três séries SVG e dimensões estáveis;
- donut de origem, barras, linhas, eixos e legendas visíveis;
- nenhum erro de console.

Evidências:

- [Financeiro completo após animações](screenshots/finance-stable-1440x1000.png)
- [Evolução da receita após animações](screenshots/finance-evolution-stable.png)

Não houve correção de produto para este finding. A correção necessária é operacional: capturas de QA devem aguardar estabilidade visual, não apenas a remoção do skeleton.

## 3. Finding — Referências por status aparentemente vazio

**Causa confirmada:** animação do gráfico de pizza ainda em andamento.

Medição no mesmo navegador:

- após 300 ms: `0` setores SVG;
- após 2,5 s: `2` setores SVG;
- payload: `ATIVO = 10`, `CANCELADO = 1`;
- KPI de referências ativas: `10`;
- dimensões finais do setor principal: aproximadamente `159,6 × 159,6 px`.

Evidências:

- [Clientes completo após animações](screenshots/clients-stable-1440x1000.png)
- [Referências por status após animações](screenshots/clients-reference-status-stable.png)

Payload, escala e renderização final são coerentes. Nenhuma fórmula, contrato ou fonte de dados foi alterada.

## 4. Finding — queda do último bucket parcial

O bucket `2026-11` é real e termina em `01/11/2026`; seus valores são zero porque a fixture não contém liquidação nesse primeiro dia do mês. A queda não é um bucket futuro e não pode ser removida ou recalculada.

Foi comprovada uma oportunidade de clareza visual: a nota global de período parcial não diferenciava o ponto diretamente no gráfico.

Correção exclusivamente visual:

- linha vertical âmbar tracejada no último bucket parcial;
- rótulo `Parcial` junto ao marcador;
- tooltip `11/2026 · parcial`;
- aplicada em `Evolução financeira` e `Evolução da receita`;
- renderização preservada com `prefers-reduced-motion: reduce`;
- valores, ordem, quantidade de buckets e séries permanecem idênticos.

Evidências:

- [Evolução financeira com marcador](screenshots/overview-partial-marker-stable.png)
- [Evolução financeira com tooltip parcial](screenshots/overview-partial-tooltip-stable.png)
- [Evolução da receita com marcador](screenshots/finance-partial-marker-stable.png)
- [Evolução da receita com tooltip parcial](screenshots/finance-partial-tooltip-stable.png)
- [Visão Geral completa](screenshots/overview-stable-1440x1000.png)
- [Financeiro completo com marcador](screenshots/finance-stable-with-partial-marker-1440x1000.png)

## 5. Arquivos de produto alterados

- `apps/web/src/components/reports/reports-intelligence-overview.tsx`
- `apps/web/src/components/reports/reports-intelligence-overview.test.ts`

Não houve alteração de backend, contrato da API, query, fórmula financeira, migration ou dependência.

## 6. Testes necessários

- Testes direcionados de Relatórios/API client: **93 passed**.
- Typecheck web: aprovado.
- Lint web: aprovado sem erros; 5 warnings preexistentes de `no-img-element` fora do escopo.
- Build web: aprovado.
- First Load JS de `/dashboard/relatorios`: `419 kB`; baseline UX-REFINE1: `417 kB` (diferença arredondada de `+2 kB`).
- Navegador real: marcadores presentes em Visão Geral e Financeiro, inclusive com reduced motion.
- Console/page errors: zero.

## 7. Integridade e restrições

- Zero migrations criadas ou executadas.
- Zero alteração financeira provocada pelos relatórios.
- Zero acesso à produção.
- Zero push, PR, merge ou deploy.
- CORE1, UI1, FINANCE1, CLIENTS1 e RENEWALS1 preservados.

## 8. Commit e tree

O commit e a tree finais são informados no handoff após a consolidação deste relatório.

## 9. Veredito

**READY FOR PUBLICATION**

A publicação continua condicionada a autorização separada.
