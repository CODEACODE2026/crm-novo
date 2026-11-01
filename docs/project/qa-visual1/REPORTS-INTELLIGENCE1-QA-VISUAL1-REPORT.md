# REPORTS-INTELLIGENCE1-QA-VISUAL1 — REPORT

## 1. Escopo e baseline

- Baseline validado: `76b07aa172ef18dcfb9a7509d7458e42b03edaa6`.
- Tree do baseline: `aa175a343b968d304566226d6afaec16eee24a61`.
- Branch isolada: `feature/reports-intelligence1-qa-visual1`.
- Worktree isolada: `/opt/codeacode/worktrees/reports-intelligence1-qa-visual1`.
- Produção, push, PR, merge, deploy, provedores financeiros, PIX e WhatsApp não foram acessados.
- Não foram criadas nem executadas migrations.

## 2. Ambiente e dados

- Chromium headless real controlado por Playwright/CDP.
- Next.js em modo de desenvolvimento para inspeção e em modo de produção local para performance.
- API local em `127.0.0.1:4310` e web local em `127.0.0.1:3310`.
- PostgreSQL **12.22**, banco exclusivo de QA, com exatamente **56 migrations** previamente aplicadas.
- Fixture fictícia representativa: 10 clientes, 11 referências ativas, uma referência cancelada, renovações/ativações/reativações pagas, pendências, múltiplas tentativas PIX, pagamento agrupado e reversões.
- Resoluções: desktop `1440×1000`, tablet `1024×768` e mobile `390×844`.

## 3. Evidências visuais

### Desktop

- [Visão Geral](screenshots/desktop-overview-1440x1000.png)
- [Financeiro](screenshots/desktop-finance-1440x1000.jpg)
- [Clientes](screenshots/desktop-clients-1440x1000.jpg)
- [Renovações](screenshots/desktop-renewals-1440x1000.jpg)
- [Renovações sem movimentação](screenshots/desktop-renewals-empty-1440x1000.png)

### Tablet

- [Visão Geral](screenshots/tablet-overview-1024x768.png)
- [Financeiro](screenshots/tablet-finance-1024x768.png)
- [Clientes](screenshots/tablet-clients-1024x768.png)
- [Renovações](screenshots/tablet-renewals-1024x768.png)

### Mobile

- [Visão Geral](screenshots/mobile-overview-390x844.png)
- [Financeiro](screenshots/mobile-finance-390x844.png)
- [Clientes](screenshots/mobile-clients-390x844.png)
- [Renovações](screenshots/mobile-renewals-390x844.png)

As quatro seções renderizaram conteúdo definitivo. Não foi encontrado texto de placeholder, corte de conteúdo ou overflow horizontal nas três resoluções.

## 4. Gráficos e interações

- Cards, tipografia, alinhamentos, espaçamentos e identidade dark/teal permaneceram consistentes.
- Quantidade de gráficos renderizados: Visão Geral 4, Financeiro 6, Clientes 7 e Renovações 7.
- Tooltip real validado no gráfico financeiro: bucket `06/2026`, com histórico importado, entradas manuais e receita operacional formatados em reais.
- Legendas, séries atual/anterior e composição por finalidade permaneceram legíveis e coerentes.
- Datas e períodos foram apresentados em `America/Sao_Paulo`.
- `prefers-reduced-motion: reduce` foi emulado no navegador; a página permaneceu funcional e os gráficos foram renderizados com a preferência reconhecida.
- No recorte sem movimentação, Renovações exibiu sete estados vazios explícitos e **zero** wrappers de gráfico, evitando visualização enganosa.
- Não foi encontrada exportação CSV na nova interface.
- A densidade informacional é alta no mobile e produz rolagem vertical longa, mas não houve corte, sobreposição ou redundância que justificasse remoção nesta missão.

## 5. Navegação e estados

- Navegação entre as quatro seções: aprovada.
- Presets e período personalizado `01/03/2026–30/06/2026`: aprovados.
- URL sincronizada com seção, preset, `startDate` e `endDate`: aprovada.
- Browser back/forward restaurou seção e período corretamente.
- Refresh e deep link preservaram autenticação e estado da URL.
- Skeleton foi observado durante resposta artificialmente atrasada.
- Falha de API foi induzida por interceptação local: o estado de erro exibiu `Tentar novamente`; o retry recuperou 8 KPIs e 6 gráficos do Financeiro.
- Sem cookie, o endpoint retornou `401 Unauthorized`.
- `AdminGuard` foi coberto pela suíte unitária (permite `ADMIN`, rejeita papel diferente). O schema desta baseline expõe apenas o papel persistível `ADMIN`, portanto não foi criado usuário não-admin artificial no banco.
- Nenhum erro de console ou page error foi observado na navegação de produção local.

## 6. Comparação UI × API

Recorte `this_year`, observado em 01/11/2026:

| Indicador                 |         API |          UI | Resultado |
| ------------------------- | ----------: | ----------: | --------- |
| Total recebido            | R$ 6.690,00 | R$ 6.690,00 | Igual     |
| Receita operacional       | R$ 6.185,00 | R$ 6.185,00 | Igual     |
| Ticket médio operacional  |   R$ 206,17 |   R$ 206,17 | Igual     |
| Novos clientes            |          10 |          10 | Igual     |
| Clientes ativos           |          10 |          10 | Igual     |
| Referências ativas        |          11 |          11 | Igual     |
| Referências canceladas    |           1 |           1 | Igual     |
| Renovações pagas          |          10 |          10 | Igual     |
| Receita de renovações     | R$ 2.705,00 | R$ 2.705,00 | Igual     |
| Ticket médio de renovação |   R$ 270,50 |   R$ 270,50 | Igual     |
| Ativações pagas           |          10 |          10 | Igual     |
| Receita de ativações      | R$ 1.385,00 | R$ 1.385,00 | Igual     |
| Reativações pagas         |          10 |          10 | Igual     |
| Receita de reativações    | R$ 2.095,00 | R$ 2.095,00 | Igual     |
| Reversões de renovação    |           3 |           3 | Igual     |

Também foi comparado o período personalizado. Exemplos: recebido `R$ 2.564,00`, renovações pagas `4`, receita de renovações `R$ 1.038,00` e ticket `R$ 259,50`, todos iguais entre API e interface.

As verificações confirmaram que:

- cobranças pendentes não entram na receita recebida;
- tentativas PIX e pagamento agrupado não duplicam ticket ou receita;
- clientes e referências são contados separadamente;
- renovação pendente e reativação pendente não entram nos indicadores pagos;
- cancelamento de referência não é apresentado como perda definitiva do cliente;
- reversões permanecem separadas da receita;
- limitações históricas estão descritas nos rodapés informativos.

## 7. Acessibilidade

- Documento em `pt-BR`, um landmark `main` e navegações nomeadas.
- Hierarquia principal `h1 → h2 → h3` preservada.
- Nenhum controle interativo sem nome acessível no recorte auditado.
- Nenhum ID duplicado e nenhuma imagem sem atributo `alt` no recorte auditado.
- Botões de seção informam seleção com `aria-current`; presets usam `aria-pressed`; loading usa `role=status`; erro de período usa `role=alert`.
- Gráficos usam a camada de acessibilidade do Recharts.
- Foco/teclado, back/forward e reduced motion foram exercitados sem perda funcional.
- Limitação: esta missão não executou um scanner automatizado completo de contraste WCAG; a inspeção visual não encontrou contraste insuficiente evidente.

## 8. Performance e bundle

Medição no build de produção local, viewport mobile, recorte anual:

- HTML response end: `12,0 ms`.
- DOMContentLoaded: `35,7 ms`.
- load: `148,7 ms`.
- painel pronto observado: `827,45 ms`.
- endpoint inicial: `25,6 ms`.
- troca de seção: Financeiro `120,85 ms`, Clientes `127,47 ms`, Renovações `105,88 ms`.
- uma requisição de relatório por seção; nenhuma repetição no build de produção.
- CLS observado: `0`.
- sem overflow horizontal em mobile.
- sem erros de console.
- bundle `/dashboard/relatorios`: route size `164 B`; First Load JS `416 kB`; compartilhado `102 kB`.

O First Load JS de 416 kB merece acompanhamento futuro, sobretudo pelo shell amplo do dashboard e Recharts, mas não causou falha funcional ou layout shift nesta validação.

## 9. Testes, lint, typecheck e build

- Suíte completa API: **1.890 passed**, 104 skipped por opt-in de banco.
- Suíte completa web: **824 passed**.
- Shared: **9 passed**.
- PostgreSQL 12.22/56 migrations, suíte de Relatórios habilitada: **24 passed**.
- Testes web direcionados de Relatórios/API client: **91 passed**.
- `pnpm typecheck`: aprovado em todos os workspaces.
- `pnpm lint`: aprovado, com 6 warnings preexistentes e fora do escopo (cinco `no-img-element`, um `eslint-disable` não utilizado).
- `pnpm build`: aprovado para shared, API e web.
- Build Next.js: aprovado com dois warnings preexistentes do Autoprefixer sobre `end`/`flex-end`.

Uma primeira tentativa da suíte PostgreSQL foi feita no mesmo banco da fixture visual e sofreu colisão de datas. A execução oficial foi repetida em um segundo banco limpo, também PostgreSQL 12.22/56 migrations, e passou integralmente.

## 10. Integridade financeira e migrations

Antes e depois da navegação e dos testes de leitura, o banco visual manteve exatamente:

- `financial_transactions`: 81 registros, soma `13.503,45`;
- `receivables`: 62 registros, soma `14.146,00`;
- `payment_intents`: 3 registros, soma `960,00`;
- `payment_groups`: 1 registro, soma `320,00`;
- `renewals`: 3 registros.

O diff de estado foi vazio. Relatórios não provocaram alteração financeira. Permaneceram **56 migrations** concluídas; zero migrations criadas ou executadas nesta missão.

## 11. Findings e correções

- Nenhum defeito comprovado de UI, navegação, acessibilidade ou integração exigiu correção de código.
- Nenhuma fórmula financeira foi alterada.
- Nenhuma funcionalidade de negócio foi iniciada.
- Foram adicionados apenas este relatório e as evidências de screenshot.

## 12. Veredito

**READY FOR PUBLICATION REVIEW**

A publicação continua condicionada a autorização separada. Esta missão não publicou nada.
