# Monthly Actual Closing — Impact Assessment

> **Escopo deste documento:** Discovery técnico e análise de impacto **somente leitura**.
> Nenhuma alteração de código, schema, migration ou dependência foi feita como parte desta análise.
> Evidências priorizadas na ordem: **Código → Testes → Banco/modelos → APIs → Documentação**.
> Projeto analisado: `itcost-pg` (cópia do servidor `172.25.103.128:/home/ayabe/Documentos/TIC/itcost-pg`).

---

## 1. Executive Summary

O **IT Cost Manager** hoje é uma aplicação **Next.js 14 (App Router) + PostgreSQL com SQL puro** (sem ORM), que controla **Budget** (orçado) e **Realizado** com granularidade **unidade × categoria × mês/ano**, comparados por uma view `vw_budget_vs_actual`. Existe também **Rateio** (critérios + função SQL `execute_rateio`).

A evolução pedida — **Fechamento Mensal do Realizado** com o fluxo conceitual **BUDGET → COMPROMETIDO → REALIZADO → PAGO → FORECAST** e um workflow de status — **não é suportada pelo modelo atual**. Especificamente:

- **BUDGET**: existe (`budget_lines`), com versionamento.
- **REALIZADO**: existe (`actual_lines`), transacional (N lançamentos por célula).
- **COMPROMETIDO / PAGO / FORECAST**: **não existem** em lugar nenhum (código, banco, API).
- **Workflow de status** (Não iniciado → … → Conciliado): **não existe**.
- **CAPEX/OPEX**: **não existe no sistema original**. Foi introduzido recentemente por migração ainda **não confirmada em produção** (`migration_cadastros.sql`), no **fornecedor** e no **actual_lines** — **não** no budget.
- **Hierarquia Plataforma/País, Projeto, Tipo de Fornecedor**: idem — introduzidos por migrações **recentes e ainda não confirmadas** em produção.

**Dois achados que afetam o planejamento:**

1. **Mismatch de granularidade Budget × Actual.** Budget é por `unit × category × month` (sem fornecedor/projeto/plataforma). Actual é por `unit × category × supplier × month` (+ projeto/cost_class recém-adicionados). A "experiência desejada" (linha com Fornecedor, Categoria, Projeto, Plataforma, CAPEX/OPEX, Budget, Comprometido, Realizado, Pago, Forecast, Desvio) **não tem um grão comum** hoje. Essa é a decisão de arquitetura mais importante.
2. **Bug de campos no Realizado manual.** A tela envia `amount/description/invoice_ref`, mas a API espera `value/note/doc_ref` — os valores chegam `undefined`. Ver §5.

**Não há testes automatizados** no projeto (nenhum arquivo `*.test.*`, `*.spec.*` ou `__tests__`), o que aumenta o risco de regressão em qualquer evolução.

---

## 2. Current Architecture

| Camada | Tecnologia | Evidência |
|---|---|---|
| Framework | **Next.js 14.2.5**, App Router | `package.json:11`, `next.config.js` |
| Linguagem | TypeScript | `tsconfig`/`package.json` devDeps |
| Frontend | **React 18**, Client + Server Components, Tailwind CSS, `lucide-react`, `clsx` | `app/**/*.tsx`, `package.json:12-20` |
| Backend | **Route Handlers do próprio Next** (`app/api/**/route.ts`) — não há backend separado | `app/api/**` |
| Banco | **PostgreSQL** (porta 5433, db `itcost`) | `lib/db.ts` |
| Persistência | **SQL puro via `pg` (node-postgres) `Pool`** — **sem ORM** | `lib/db.ts:1-12` |
| Auth | **JWT em cookie httpOnly** (`jsonwebtoken`) + `bcryptjs` | `lib/auth.ts`, `app/api/auth/login/route.ts` |
| i18n | `next-intl` (adição recente, ainda não confirmada em produção) | `next.config.js`, `i18n/request.ts`, `messages/*` |
| Testes | **Nenhum** | busca por `*.test.*`/`*.spec.*`/`__tests__` = 0 |
| Deploy | `next dev` rodando no servidor Linux (modo desenvolvimento) | processo `node …/next dev` na porta 3000 |

Padrão de acesso a dados: cada rota faz `pool.query(\`SQL…\`, params)` diretamente. Não há camada de "services"/"repositories" nem entidades de domínio — a lógica de negócio (quando existe) está **no SQL** (ex.: função `execute_rateio`) ou inline nas rotas.

---

## 3. Current Data Model

Tabelas confirmadas por `\d` (banco) e/ou `lib/types.ts` e SQL de importação.

### `budget_lines`  *(fonte: `lib/types.ts:BudgetLine`, `app/api/budget/route.ts`, `import_budget_2026.sql`)*
`id uuid, unit_id uuid, category_id uuid, year int, month int, value numeric(15,2), version int, is_active bool` (+ `uploaded_by` visto nos INSERTs).
- **Sem** `supplier_id`, **sem** `project_id`, **sem** `platform_id`, **sem** `cost_class`.
- Versionamento por `(unit, category, year, month)` via `version` + `is_active`.

### `actual_lines`  *(fonte: `\d public.actual_lines`, `lib/types.ts:ActualLine`)*
`id uuid, unit_id uuid, category_id uuid, supplier_id uuid?, year int, month int, value numeric(15,2), origin actual_origin, source text='manual', doc_ref text?, note text?, created_at timestamptz, created_by uuid?`.
- Enum `actual_origin = { DIRETO, RATEADO_ORIGEM, RATEADO_ADM }`.
- `CHECK (month BETWEEN 1 AND 12)`; FKs para units/categories/suppliers/users.
- **LACUNA DE EVIDÊNCIA:** o `\d` capturado **não** exibiu `cost_class`/`project_id` que a `migration_cadastros.sql` adiciona — o estado real dessas colunas no banco de produção é incerto.

### `categories`  *(`\d public.categories`)*
`id uuid, code text UNIQUE, name text, description text?, is_active bool`.

### `suppliers`  *(código + `migration_cadastros.sql`)*
Original: `id, cnpj?, name, short_name?, is_active` (`lib/types.ts:Supplier`).
Adicionado por migração recente (não confirmada): `supplier_type_id, category_id, expense_mode(enum RATEIO|DIRETO), unit_id, cost_class(enum CAPEX|OPEX|OTC), project_id, short_name`; e N:N `supplier_countries`.

### `units`  *(`app/api/units/route.ts`, `import_budget_2026.sql`)*
`id, code, name, type('OP'|'ADM'), is_active` (+ `country_id` por migração recente não confirmada).

### Rateio  *(`app/api/rateio/route.ts`, `app/api/actual/rateio/route.ts`, `\d` referências)*
- `rateio_criteria`: `id, supplier_id?, category_id?, driver, valid_from, valid_to?, is_active, description?`.
- `rateio_unit_weights`: `criteria_id, unit_id, weight` (UNIQUE `(criteria_id, unit_id)`).
- `rateio_results`: referencia `actual_lines(id)` via `source_line_id` (visto em `\d actual_lines`).
- **Função** `public.execute_rateio(year, month)` — invocada em `app/api/actual/rateio/route.ts:10`.

### `users`  *(`app/api/admin/users/route.ts`, `login`)*
`id, email, password_hash, full_name?, role('admin'|'unit_viewer'), unit_id?, is_active` (+ `platform_id, country_id, lang` por migrações recentes não confirmadas).

### View de comparação
`public.vw_budget_vs_actual`: `unit_id, category_id, year, month, budgeted, actual, variance, variance_pct` (consumida em `app/api/dashboard/route.ts` e `lib/types.ts:BudgetVsActual`).
- **LACUNA DE EVIDÊNCIA:** a **definição** da view e da função `execute_rateio` está apenas no banco — **não há arquivo** de schema/migration no repositório que as crie (só `import_budget_2026.sql` de dados). Isso é um risco de manutenção.

**Tabelas/artefatos criados por migrações recentes e NÃO confirmadas em produção** (evidência: arquivos `migration_cadastros.sql`, `migration_hierarquia.sql`, `migration_i18n.sql` na raiz; deploy relatado como pendente para hierarquia/i18n): `supplier_types`, `projects`, `platforms`, `countries`, `supplier_countries`, colunas `cost_class`/`project_id`/hierarquia/`lang`.

---

## 4. Current Budget Flow

1. **Carga**: `BudgetUploadClient.tsx` lê planilha/CSV (aba "Budget") e envia linhas para `POST /api/budget`.
2. **Persistência** (`app/api/budget/route.ts`): para cada linha `(unit, category, year, month, value)`, busca a versão ativa, **desativa** a anterior e **insere** nova `version`. Transacional (`BEGIN/COMMIT`).
3. **Granularidade**: `unit × category × year × month`. **Não** carrega fornecedor, projeto, plataforma nem CAPEX/OPEX no budget.
4. **Comparação**: apenas via `vw_budget_vs_actual` (Dashboard/Relatório), somando actual por `unit×category×month`.

**Implicação:** o Budget é "grosso" (sem fornecedor/projeto). Qualquer visão de fechamento por **fornecedor/projeto/CAPEX-OPEX** com "Budget do item" exigirá ou (a) enriquecer o grão do budget, ou (b) comparar em grão agregado.

---

## 5. Current Actual Flow

1. **Tela** `ActualClient.tsx`: filtro `ano/mês/unidade`; lançamento **manual** ("Novo Lançamento Direto") com categoria, fornecedor, valor, descrição, NF/Ref; botão **Executar Rateio**.
2. **API** `GET/POST/DELETE /api/actual`:
   - `GET`: `SELECT * FROM actual_lines WHERE year=$1 AND month=$2` (+ escopo `unit_id` e exclusão de `RATEADO_ORIGEM` para `unit_viewer`).
   - `POST` (admin): insere em `actual_lines` com `origin` default `DIRETO`, `source` default `manual`, `created_by`.
   - `DELETE`: remove por `id`.
3. **Rateio** `POST /api/actual/rateio` → `SELECT execute_rateio(year, month)` (lógica no banco). Gera linhas `RATEADO_ADM` a partir de `RATEADO_ORIGEM`, registradas em `rateio_results`.
4. **Relação com Budget**: nenhuma FK direta; comparação só pela view em grão `unit×category×month`. **Múltiplos** `actual_lines` podem existir para a mesma célula (N:1 em relação ao budget) — **já suportado**.

> ⚠️ **BUG DE CONTRATO (evidência):** `ActualClient.handleAdd` (`app/actual/ActualClient.tsx:66-74`) envia `{ amount, description, invoice_ref }`, mas `POST /api/actual` (`app/api/actual/route.ts:24`) desestrutura `{ value, note, doc_ref }`. Resultado: `value` chega `undefined` → provável violação de `NOT NULL` ao inserir. O lançamento manual de Realizado **provavelmente não funciona** hoje. (Não corrigido — fora do escopo deste discovery.)

> **LACUNA DE EVIDÊNCIA:** não há importação de Realizado por CSV/SAP nesta versão (`itcost-pg`). O `source` aceita valores livres (`manual`, `rateio`, e há string `upload_sap` referenciada em outra base), mas **não existe endpoint de importação** aqui.

---

## 6. Gap Assessment

| Requisito | Existe hoje? | Evidência no código | Gap | Impacto |
|---|---|---|---|---|
| **Budget** por unidade/categoria/mês | ✅ Sim | `budget_lines`, `app/api/budget/route.ts` | — | — |
| Budget por **fornecedor** | ❌ Não | `BudgetLine` sem `supplier_id` | Grão do budget não tem fornecedor | Alto (base do fechamento por item) |
| Budget por **projeto/plataforma** | ❌ Não | idem | Sem dimensões | Médio |
| **Realizado** | ✅ Sim (transacional) | `actual_lines`, `app/api/actual` | Bug de contrato (§5) | Alto (não grava) |
| **Comprometido** | ❌ Não | busca: 0 ocorrências | Conceito inexistente | Alto |
| **Pago** (payment/paid) | ❌ Não | busca: só `invoice_ref`/`doc_ref` (texto) | Sem data/flag de pagamento | Alto |
| **Forecast** | ❌ Não | busca: 0 ocorrências | Conceito inexistente | Alto |
| **CAPEX/OPEX** | ⚠️ Parcial/recente | `migration_cadastros.sql` (enum `cost_class` em suppliers/actual_lines) — **não** no budget; deploy incerto | Não está no budget; grão inconsistente | Alto |
| **Workflow de status** | ❌ Não | nenhum campo `status`/estado | Sem máquina de estados | Alto |
| Filtro por **Ano/Mês/Unidade** | ✅ Sim | `ActualClient`, `DashboardClient` | — | Baixo |
| Filtro por **País/Plataforma** | ⚠️ Recente | hierarquia por migração não confirmada; **não** aplicada a budget/actual | Filtro só via join unidade→país | Médio |
| **Desvio** (variance) | ✅ Sim (budget×actual) | `vw_budget_vs_actual` | Só 2 dimensões (budget/actual) | Médio |
| **Histórico/auditoria** de alterações | ⚠️ Parcial | `budget_lines.version`; `actual_lines.created_at/created_by`; sem tabela de auditoria | Sem trilha de mudanças por estágio | Médio |
| **Origem do dado** (manual/import/SAP) | ⚠️ Parcial | `actual_lines.source` (texto livre) | Sem enum/coluna estruturada de origem por estágio | Médio |
| **Preparação p/ integração SAP** | ❌ Não | sem camada de integração | Sem contrato/idempotência/external_id | Médio (futuro) |
| **Testes** | ❌ Não | 0 arquivos de teste | Sem rede de segurança | Alto (risco) |

---

## 7. Data Model Impact

As mudanças necessárias dependem das **decisões de §13**. Em qualquer cenário:

**Novas colunas de estágio financeiro** (onde quer que o "item transacional" resida): `committed_value`, `paid_value`, `paid_date`, `forecast_value` — ou linhas transacionais separadas por estágio (ver §13-B).

**Novas colunas de classificação/dimensão** para permitir a visão pedida no grão comum:
- `cost_class` (CAPEX/OPEX) — hoje só em suppliers/actual_lines (recente). Provável necessidade também no budget para comparar.
- `project_id`, e derivação de `platform_id`/`country_id` via `unit`.

**Workflow**: coluna `status` (enum) + tabela de histórico de transição `*_status_history` (from/to/user/timestamp).

**Auditoria/origem**: enum `data_source (MANUAL|IMPORT|SAP)` + `external_id`/`external_ref` (idempotência p/ integração) + `updated_by/updated_at`.

**Migrations**: seguir o padrão atual (arquivos `.sql` idempotentes com `IF NOT EXISTS`, rodados via `psql`). ⚠️ **Recomenda-se primeiro versionar no repositório a definição de `vw_budget_vs_actual` e `execute_rateio`** (hoje só existem no banco), pois novas colunas de estágio exigirão recriar a view.

**LACUNA DE EVIDÊNCIA:** sem a definição da view/função no repo, não é possível dimensionar com precisão o impacto de alterá-las.

---

## 8. Backend Impact

- **Sem camada de service/entidade** hoje → decidir se a evolução introduz uma fina camada de domínio (`lib/finance/*`) ou mantém SQL nas rotas (consistente com o atual).
- **Endpoints novos/alterados** (conceituais):
  - Estágios: gravar/atualizar comprometido, realizado (corrigir §5), pago, forecast.
  - Workflow: transição de status com validação de estados permitidos.
  - Fechamento: consulta consolidada por `ano/mês/unidade[/país]` retornando as colunas da experiência (§3 desejada).
  - Importação/idempotência: endpoint preparado para receber Realizado/Pago externo (SAP), com `external_id`.
- **Validações**: valores ≥ 0, mês 1–12, transições de status válidas, escopo por unidade/país.
- **Correção obrigatória** do contrato `ActualClient` × `/api/actual` (§5) antes de qualquer fechamento confiável.

---

## 9. Frontend Impact

- **Nova tela "Fechamento Mensal"**: filtros `Ano/Mês/Unidade[/País]`; grade por item com colunas Fornecedor, Categoria, Projeto, Plataforma, CAPEX/OPEX, Budget, Comprometido, Realizado, Pago, Forecast, Desvio; edição inline dos estágios (quando manual) e indicador de origem (manual/SAP).
- **Componente de workflow/status** (badge + ação de transição) — se aprovado.
- Reuso de padrões existentes: filtros de `ActualClient`/`DashboardClient`, tabelas com `overflow-x-auto`, seletor de mês/ano, escopo por `user.role`/`unit_id`.
- **i18n**: como `next-intl` está sendo introduzido, textos novos já devem entrar via dicionário `messages/*` (evita retrabalho).

---

## 10. Integration Impact (SAP S/4HANA / Data Platform — futuro)

- Arquitetura alvo: `SAP/Data Platform → API → IT Cost Manager`. **Não implementar agora.**
- Preparar o modelo para ingestão **idempotente**: `data_source` estruturado, `external_id`/`external_ref`, `imported_at`, e chave natural estável por lançamento para permitir *upsert* sem duplicar.
- Evitar premissas de "digitação manual permanente": estágios (Realizado/Pago) devem aceitar **origem = importação/SAP** sem retrabalho de modelo. Um endpoint de ingestão desacoplado (contrato JSON estável) é preferível a acoplar a lógica na tela.
- Reconciliação: prever `external_ref` (doc SAP) para conciliar manual × importado.

---

## 11. Security Impact

- Modelo atual: `role ∈ {admin, unit_viewer}`; `admin` gate na maioria das mutações; `unit_viewer` restrito ao próprio `unit_id` (ex.: `app/api/actual/route.ts:15-18`, `dashboard/route.ts:12`).
- Evolução exige decidir **quem pode alterar cada estágio** (ex.: quem marca "Pago" ou "Conciliado"). Possível necessidade de perfis mais granulares (ex.: `finance_closer`).
- **Escopo por país/plataforma**: hoje inexistente em budget/actual (só via unidade). Se o fechamento for por país, o filtro de autorização precisa considerar `country_id` do usuário (coluna recém-adicionada, deploy incerto).
- Trilha de auditoria (quem/quando/origem) reforça segurança e conformidade.

---

## 12. Testing Impact

- **Não há testes hoje** → qualquer mudança em `budget_lines`/`actual_lines`/view carrega risco de regressão silenciosa.
- Novos testes recomendados (mínimo): unit/integração para (a) contrato das rotas `/api/actual` e `/api/budget`, (b) cálculo de Desvio/Forecast, (c) transições de status válidas/ inválidas, (d) idempotência de importação, (e) escopo de autorização por unidade/país.
- Sem framework de teste configurado (`package.json` não tem jest/vitest/playwright) → decisão adicional de tooling.

---

## 13. Architecture Decisions Required

> Para cada decisão: Opção A / Opção B (prós e contras) + recomendação técnica e justificativa. **Não decidir silenciosamente.**

### A) Budget e Actual devem compartilhar a mesma entidade?
**Opção A — Manter separados (`budget_lines` × `actual_lines`)**
- Prós: reflete o modelo atual; grãos diferentes (budget sem fornecedor, actual com); versionamento de budget independente; menor risco.
- Contras: comparação depende de view/junção; grão comum precisa ser definido.

**Opção B — Entidade única com "tipo" (budget/actual/…)**
- Prós: uma tabela, comparação trivial por linha.
- Contras: reescrita grande; mistura conceitos com ciclos de vida distintos (versionamento de budget × transações de actual); alto risco sem testes.

**Recomendação: A (manter separados).** Justificativa: o sistema já é assim, os ciclos de vida são diferentes, e o esforço/risco de unificar (sem testes) não se paga. Resolver a comparação com **grão comum explícito** e view versionada.

### B) Actual/Pago deveriam ser entidades transacionais separadas?
**Opção A — Estágios como colunas na linha (committed/actual/paid/forecast na mesma linha do item)**
- Prós: leitura simples para a grade de fechamento; 1 linha por item/mês.
- Contras: 1 realizado por célula por padrão; pagamentos parciais/múltiplos ficam difíceis; perde granularidade transacional (ruim para SAP).

**Opção B — Linhas transacionais por evento/estágio (uma tabela `financial_entries` com `stage ∈ {COMMITTED, ACTUAL, PAID}` + `forecast` à parte)**
- Prós: N lançamentos por item (parciais, múltiplas NFs/pagamentos); casa com ingestão SAP; auditável; agregação por view.
- Contras: mais complexo; a grade de fechamento passa a somar/rolar por item.

**Recomendação: B (transacional por estágio), com uma view de consolidação por item/mês.** Justificativa: o próprio Realizado já é transacional (N `actual_lines` por célula) e a integração SAP exige granularidade e idempotência. Forecast é exceção (ver C).

### C) Forecast deve ser armazenado ou calculado?
**Opção A — Calculado** (ex.: `realizado_até_agora + budget_restante`, ou `run-rate`)
- Prós: sempre coerente; zero digitação; sem tabela nova.
- Contras: fórmula é regra de negócio **não informada**; não permite override do gestor.

**Opção B — Armazenado** (forecast do gestor por item/mês, com histórico)
- Prós: reflete julgamento do responsável; auditável; permite revisões.
- Contras: exige entrada/manutenção; risco de ficar desatualizado.

**Recomendação: Híbrido — armazenar com default calculado.** Persistir `forecast_value` por item/mês, inicializado por uma fórmula default e **editável** pelo gestor, mantendo histórico. Justificativa: atende "estimativa atualizada" com governança, sem obrigar digitação do zero.
**LACUNA DE EVIDÊNCIA:** a fórmula de forecast default não foi informada — **decisão de negócio pendente**.

### D) Devemos manter histórico das alterações?
**Opção A — Sem histórico** (só valor corrente). Prós: simples. Contras: sem rastreabilidade de fechamento (inaceitável p/ conciliação).
**Opção B — Histórico/auditoria** (tabela de mudanças e/ou de transição de status). Prós: rastreável; conformidade. Contras: mais tabelas/escrita.
**Recomendação: B**, ao menos para **transições de status** e para **valores de estágio** (quem/quando/origem). Justificativa: fechamento e conciliação exigem trilha; o budget já usa versionamento, coerente estender a ideia.

### E) Precisamos registrar usuário / timestamp / origem (manual/importação/SAP)?
**Recomendação: Sim.** `actual_lines` já tem `created_by/created_at/source`. Estruturar `source` como **enum `data_source (MANUAL|IMPORT|SAP)`** + `external_id`/`external_ref` + `updated_by/updated_at`. Justificativa: essencial para conciliação e para a futura ingestão SAP idempotente.

### F) O modelo atual suporta múltiplos realizados contra um único item de Budget?
**Resposta (evidência):** **Sim.** `actual_lines` permite N linhas por `unit×category×month`, e `vw_budget_vs_actual` soma o actual contra 1 célula de budget. Ou seja, N:1 (actual:budget) **já é suportado** no grão atual. **Porém**, como o budget não tem fornecedor/projeto, o "item" de budget é mais grosso que o item de actual — a correspondência 1-item-a-1-item pedida na experiência **não existe** sem decidir o grão comum (ver A/§4).

---

## 14. Evidence Gaps

- **LACUNA:** Definição de `vw_budget_vs_actual` e da função `execute_rateio` **não está no repositório** (apenas no banco). Impede dimensionar com precisão alterações na comparação/rateio.
- **LACUNA:** Estado real das colunas recém-migradas (`cost_class`, `project_id`, hierarquia, `lang`) em **produção** é incerto — o `\d actual_lines` capturado não as mostrou e migrações de hierarquia/i18n foram relatadas como **pendentes**.
- **LACUNA:** Fórmula de **Forecast** default não informada (regra de negócio).
- **LACUNA:** Definições de **COMPROMETIDO** (o que dispara, quem lança, relação com pedido/contrato) não detalhadas o suficiente para modelar chaves.
- **LACUNA:** Workflow de status **não aprovado**; estados e permissões de transição a confirmar.
- **LACUNA:** Contrato futuro do SAP/Data Platform (campos, chave natural, frequência) desconhecido.
- **LACUNA:** Se o fechamento é por **fornecedor+categoria+projeto** (grão fino) ou por **categoria** (grão do budget) — determina toda a modelagem.

---

## 15. Risks

1. **Sem testes** → alto risco de regressão em `budget/actual/view`. (Mitigar: criar testes antes de alterar a view.)
2. **View/função só no banco** → alterações "invisíveis" ao versionamento; risco de perda em recriação de ambiente.
3. **Mismatch de granularidade Budget×Actual** → se ignorado, comparações "Budget do item" ficarão inconsistentes.
4. **Bug de contrato no Realizado (§5)** → dados de fechamento não confiáveis até corrigir.
5. **Migrações recentes não confirmadas** → construir sobre colunas que podem não existir em produção.
6. **Ambiente em `next dev`** (desenvolvimento) servindo produção → instabilidade e ausência de build otimizado.
7. **Escopo crescente** (ERP-like) → risco de o IT Cost Manager sair do papel de "camada gerencial".

---

## 16. Proposed Implementation Units

> Funcionalidades de negócio pequenas, completas e **validáveis**. **Nenhuma implementada aqui.** Ordem sugerida; cada uma exige aprovação das decisões relacionadas.

**IU-0 — Consolidar a base (pré-requisito técnico)**
Versionar no repo as definições de `vw_budget_vs_actual` e `execute_rateio`; confirmar/estabilizar as migrações recentes (hierarquia, cost_class, i18n) em produção. *Validação:* schema reproduzível a partir do repo.

**IU-1 — Corrigir o Realizado manual (bug §5)**
Alinhar contrato `ActualClient` × `/api/actual` (value/note/doc_ref). *Validação:* lançar e persistir um realizado manual.

**IU-2 — Definir e fixar o "grão do fechamento"**
Decisão A/§13 aplicada: escolher grão comum (ex.: `unit × category × supplier? × project? × month`) e a estratégia de comparação com o budget. *Validação:* documento de grão + view de consolidação em grão único.

**IU-3 — CAPEX/OPEX consistente**
Consolidar `cost_class` como dimensão de classificação onde o grão exigir (item/linha), com default do fornecedor. *Validação:* filtrar/somar por CAPEX/OPEX no fechamento.

**IU-4 — Estágio "Pago"**
Adicionar registro de pagamento (valor pago + data + origem) transacional (§13-B/E). *Validação:* marcar pagamentos e ver "Pago" na grade.

**IU-5 — Estágio "Comprometido"**
Registrar comprometido por item/mês (origem manual inicialmente). *Validação:* ver "Comprometido" e Desvio Budget–Comprometido.

**IU-6 — Forecast**
Persistir forecast por item/mês com default calculado e override (§13-C). *Validação:* editar forecast e ver projeção/desvio.

**IU-7 — Tela de Fechamento Mensal (consolidada)**
Grade por item com todas as colunas (Budget/Comprometido/Realizado/Pago/Forecast/Desvio) + filtros Ano/Mês/Unidade/País. *Validação:* fechar um mês de ponta a ponta em uma tela.

**IU-8 — Workflow de status (se aprovado)**
Máquina de estados (Não iniciado → Aguardando documento → Realizado → Pago → Conciliado) com histórico e permissões. *Validação:* transições válidas/bloqueadas + trilha.

**IU-9 — Auditoria & origem estruturada**
`data_source` enum + `external_id`/`external_ref` + histórico de valores/status. *Validação:* rastrear quem/quando/origem de cada valor.

**IU-10 — Preparação para ingestão SAP (sem integrar)**
Endpoint de ingestão idempotente com contrato JSON estável e upsert por chave natural. *Validação:* importar um lote simulado sem duplicar.

**IU-11 — Rede de testes**
Introduzir tooling de teste e cobrir contratos/regras críticas. *Validação:* suíte verde no CI local.

---

### Resumo das principais descobertas

- O sistema é **Next.js + PostgreSQL SQL-puro (sem ORM), sem testes**, com **Budget** e **Realizado** já existentes, mas **Comprometido, Pago, Forecast e Workflow inexistentes**.
- **CAPEX/OPEX, Projeto, Plataforma/País** só chegaram por **migrações recentes não confirmadas** e **não estão no budget**.
- Há **mismatch de granularidade Budget × Actual** e um **bug de contrato no Realizado manual** que precisam ser resolvidos antes de um fechamento confiável.
- Regras críticas da view/rateio **vivem só no banco** (fora do versionamento).

### Decisões de negócio que precisam ser tomadas antes de implementar

1. **Grão do fechamento**: por fornecedor+categoria+projeto (fino) ou por categoria (grão do budget)?
2. **Comprometido**: o que o dispara (pedido/contrato), quem lança e como se relaciona ao budget?
3. **Forecast**: fórmula default + se permite override do gestor.
4. **Workflow de status**: aprovar (ou não) e definir estados + quem pode transicionar cada um.
5. **Perfis/permissões** por estágio e **escopo por país/plataforma**.
6. **Pagamentos**: permitir parciais/múltiplos por item? (define coluna vs. tabela transacional).
7. **Budget enriquecido?** Incluir fornecedor/projeto/CAPEX-OPEX no budget para comparar item a item?
