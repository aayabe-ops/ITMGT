# MVP Core — Technical Design (IU-1 · IU-2 · IU-B · IU-7 reduzido)

> **Design técnico — nada implementado, migrado ou aplicado.**
> DDL/SQL/contratos abaixo são **propostas de desenho** para revisão, não scripts para rodar.
> Base: `impact-assessment`, `requirements`, `backlog`. Decisões de referência: D1 (grão fino), D6/L3 (budget enriquecido), D5 (transacional), D7/L4 (escopo — **adiado para IU-SC**).

## Escopo deste MVP
Entregar a **tela de Fechamento Mensal reduzida**: por item no grão fino, comparar **Budget × Realizado × Desvio**. Comprometido, Pago e Forecast **não** entram aqui (fases seguintes). Escopo de acesso continua o atual (admin/unit_viewer); o escopo múltiplo (IU-SC) vem depois.

---

## 0. Dependência bloqueante (IU-0)
Para desenhar a view de consolidação com segurança, é necessário **extrair a definição atual** de `public.vw_budget_vs_actual` (e `execute_rateio`), que hoje só existem no banco.
- **Ação de coleta (read-only):** `\d+ public.vw_budget_vs_actual` e `pg_get_viewdef('public.vw_budget_vs_actual')`.
- **LACUNA L-5.2:** enquanto a definição não estiver versionada, o design da nova view é *alvo proposto*, não *delta exato*.

---

## 1. IU-1 — Corrigir o Realizado manual (contrato tela × API)

**Problema (evidência):** `app/actual/ActualClient.tsx:66-74` envia `{ amount, description, invoice_ref }`; `app/api/actual/route.ts:24` lê `{ value, note, doc_ref }` → `value` chega `undefined`.

**Decisão de design:** os **nomes canônicos são os da coluna do banco** (`value`, `note`, `doc_ref`). Ajustar o **cliente** para enviar esses nomes (mudança menor, mantém a API estável e alinhada ao schema).

**Delta proposto (cliente):**
```
// ActualClient.handleAdd — body
{
  unit_id, category_id, supplier_id: supplier_id || null,
  year, month,
  value: parseFloat(amount.replace(',', '.')),   // era: amount
  note: description || null,                      // era: description
  doc_ref: invoice_ref || null,                   // era: invoice_ref
  origin: 'DIRETO'
}
```
**Sem alteração de schema.** **Teste (IU-11a):** POST insere e o valor persiste ≠ null.
**Nota:** validar `value >= 0` e `category_id` obrigatório no servidor (hoje não valida).

---

## 2. IU-2 — Grão fino e identidade do item

**Grão canônico do item (D1):**
`(unit_id, category_id, supplier_id, project_id, year, month)` + atributo `cost_class`.
Plataforma/País derivam de `unit → country → platform`.

**Aderência atual:**
- `actual_lines` já tem `unit_id, category_id, supplier_id, year, month`; `project_id`/`cost_class` foram adicionados por `migration_cadastros.sql` (**confirmar deploy — L-5.3**).
- `budget_lines` **não** tem `supplier_id`/`project_id` → resolvido na IU-B.

**Tratamento de NULL na chave (crítico para o JOIN):**
- **Fornecedor:** nunca nulo — linhas sem fornecedor usam o **fornecedor sentinela "A DEFINIR"** (L-3). Assim o JOIN por `supplier_id` é exato dos dois lados.
- **Projeto:** pode ser nulo dos dois lados. No JOIN usar **`IS NOT DISTINCT FROM`** (trata `NULL = NULL` como verdadeiro) para não perder linhas.

**Fornecedor sentinela (proposta):** uma linha fixa em `suppliers` com `code`/marcador `A-DEFINIR` (ou coluna `is_placeholder boolean`), referenciada na recarga e nos lançamentos sem fornecedor.

---

## 3. IU-B — Budget enriquecido (o item mais pesado)

### 3.1 Migração de schema (proposta — não aplicar)
```sql
-- Budget no grão fino
ALTER TABLE public.budget_lines
  ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES public.suppliers(id),
  ADD COLUMN IF NOT EXISTS project_id  uuid REFERENCES public.projects(id);

-- Fornecedor sentinela "A definir" (idempotente)
INSERT INTO public.suppliers (name, short_name, is_active)
SELECT 'A DEFINIR', 'A DEFINIR', true
WHERE NOT EXISTS (SELECT 1 FROM public.suppliers WHERE upper(name)='A DEFINIR');
```
**Versionamento:** a chave de versão do budget passa de `(unit, category, year, month)` para **`(unit, category, supplier, project, year, month)`**. Impacta:
- `app/api/budget/route.ts` — o `SELECT version…` e o `UPDATE is_active=false…` precisam incluir `supplier_id` e `project_id` na chave.
- **LACUNA:** definir se `project_id NULL` participa da chave (usar `IS NOT DISTINCT FROM` na busca de versão ativa).

### 3.2 Recarga do Budget (processo, L-3)
- Fonte: BG2026 (tem **Fornecedor**, **não** tem Projeto).
- Mapear `Fornecedor` do template → `suppliers` por nome (case-insensitive); **sem match / placeholder** (`*A DEFINIR*`, `VERIFICAR`, vazio) → **fornecedor sentinela**.
- `project_id = NULL` (atribuível depois).
- Reaproveitar o gerador já usado (script de ETL da planilha) adaptado para emitir `supplier_id`; **decisão de negócio:** categoria do budget = Descrição Global (5) ou Despesa[KPI]? *(hoje o budget carregado usa 5 categorias — manter consistência).*
- **LACUNA L-3.1:** confirmar regra de deduplicação quando várias linhas do template caem no mesmo grão (somar).

### 3.3 Impacto na consolidação
A view de comparação deve agrupar budget e actual **no grão fino** (ver §4). Recriar `vw_budget_vs_actual` (ou criar `vw_closing`) com `supplier_id`/`project_id` no `GROUP BY`.

---

## 4. IU-7 reduzido — View + API + Tela (Budget × Realizado × Desvio)

### 4.1 View de consolidação (proposta — alvo)
```sql
CREATE OR REPLACE VIEW public.vw_closing AS
WITH bud AS (
  SELECT unit_id, category_id, supplier_id, project_id, year, month,
         SUM(value) AS budgeted
  FROM public.budget_lines
  WHERE is_active = true
  GROUP BY 1,2,3,4,5,6
),
act AS (
  SELECT unit_id, category_id, supplier_id, project_id, year, month,
         SUM(value) AS actual
  FROM public.actual_lines
  WHERE origin <> 'RATEADO_ORIGEM'
  GROUP BY 1,2,3,4,5,6
)
SELECT
  COALESCE(b.unit_id, a.unit_id)         AS unit_id,
  COALESCE(b.category_id, a.category_id) AS category_id,
  COALESCE(b.supplier_id, a.supplier_id) AS supplier_id,
  COALESCE(b.project_id,  a.project_id)  AS project_id,
  COALESCE(b.year, a.year)               AS year,
  COALESCE(b.month, a.month)             AS month,
  COALESCE(b.budgeted, 0)                AS budgeted,
  COALESCE(a.actual, 0)                  AS actual,
  COALESCE(a.actual,0) - COALESCE(b.budgeted,0) AS variance,
  CASE WHEN COALESCE(b.budgeted,0) <> 0
       THEN (COALESCE(a.actual,0)-COALESCE(b.budgeted,0))/b.budgeted*100 END AS variance_pct
FROM bud b
FULL OUTER JOIN act a
  ON  b.unit_id = a.unit_id
  AND b.category_id = a.category_id
  AND b.supplier_id IS NOT DISTINCT FROM a.supplier_id
  AND b.project_id  IS NOT DISTINCT FROM a.project_id
  AND b.year = a.year AND b.month = a.month;
```
- **FULL OUTER JOIN**: mostra itens só-budget (a realizar) e só-actual (sem budget).
- **Compatibilidade:** manter a `vw_budget_vs_actual` atual (grosso) para Dashboard/Relatório existentes; a nova `vw_closing` é adicional. *(Evita quebrar `app/api/dashboard/route.ts` e `report`.)*

### 4.2 API (proposta)
`GET /api/closing?year=&month=&unit_id=&country_id=`
- Auth: `getCurrentUser`; `unit_viewer` restrito a `user.unit_id`; admin livre (escopo múltiplo → IU-SC).
- Query: `SELECT * FROM vw_closing WHERE year=$1 AND month=$2 [AND unit_id=$..]` + JOINs para nomes (`suppliers`, `categories`, `projects`, `units`, `countries`, `platforms`) e `cost_class` (do fornecedor ou do actual).
- Retorno por linha: `unit_code, category_name, supplier_name, project_name, platform_name, country_name, cost_class, budgeted, actual, variance, variance_pct`.
- **Nota cost_class:** no MVP, exibir `cost_class` do fornecedor (default). Fica exato quando os lançamentos carregarem `cost_class` próprio (IU-3).

### 4.3 Tela `/closing` (Fechamento Mensal — reduzida)
- **Rota/arquivos (proposta):** `app/closing/page.tsx` (server, guard + fetch de filtros) + `app/closing/ClosingClient.tsx` (client).
- **Filtros:** Ano, Mês, Unidade (admin), opcional País/Plataforma (derivados). Padrão: mês corrente.
- **Colunas:** Unidade · Categoria · Fornecedor · Projeto · Plataforma · CAPEX/OPEX · **Budget · Realizado · Desvio (R$) · Desvio (%)**.
- **Comportamento:** somatórios no rodapé; realce de desvio (verde abaixo / vermelho acima); linha "A definir" quando fornecedor sentinela.
- **Reuso:** padrões de `DashboardClient`/`ActualClient` (seletores, tabela `overflow-x-auto`, `BRL`, i18n via `next-intl` já em curso).
- **Menu:** adicionar item "Fechamento" no `Layout` (grupo principal).
- **Escopo reduzido:** sem edição de valores nesta tela (só leitura/consolidação). Edição de Realizado continua na tela Realizado (corrigida na IU-1).

---

## 5. Resumo de artefatos do MVP (proposto)

| Camada | Novo/Alterado | Item |
|---|---|---|
| DB | ALTER | `budget_lines` +`supplier_id`,+`project_id`; sentinela "A DEFINIR" |
| DB | CREATE | view `vw_closing` (grão fino) |
| DB | (coleta) | versionar `vw_budget_vs_actual`/`execute_rateio` (IU-0) |
| Backend | ALTER | `app/api/budget/route.ts` (chave de versão + supplier/project) |
| Backend | FIX | `ActualClient` → contrato do `/api/actual` (IU-1) |
| Backend | NEW | `app/api/closing/route.ts` |
| Frontend | NEW | `app/closing/page.tsx`, `app/closing/ClosingClient.tsx`; item de menu |
| ETL | ALTER | script de recarga do budget (emitir `supplier_id`) |
| Testes | NEW | contrato `/api/actual`, `/api/budget` (chave fina), `/api/closing` (desvio) |

---

## 6. Riscos e lacunas específicas do MVP
- **R1:** recriar `vw_budget_vs_actual` sem a definição atual versionada → **coletar antes** (IU-0). Mitigação: criar `vw_closing` **nova** e não tocar a atual no MVP.
- **R2:** mudança da chave de versão do budget pode conflitar com dados já carregados no grão grosso → **plano de recarga** limpo por ano (como o `import_budget_*` faz hoje).
- **R3:** `project_id`/`cost_class` em `actual_lines` dependem de migração ainda não confirmada (L-5.3).
- **L-MVP-1 — RESOLVIDA:** categoria do budget fino = **as 5 "Descrição Global"** (consistente com budget/realizado atuais; fornecedor dá o detalhe). Sem re-semear categorias.
- **L-MVP-2 — RESOLVIDA:** exibir **todos** os itens (com Budget e/ou Realizado) via **FULL OUTER JOIN** — inclui "realizado sem orçamento" (estouro) e "orçado a realizar". Casos de borda podem ser destacados/filtrados na tela.
- **Pendência de coleta (IU-0):** extrair `pg_get_viewdef('public.vw_budget_vs_actual')` e `execute_rateio` (read-only) para versionar. Mitigado no MVP por criar `vw_closing` **nova** sem tocar a atual.

---

## 7. Critérios de aceite do MVP
1. Lançar um Realizado manual e ele **persistir** (IU-1).
2. Budget recarregado com **fornecedor** por linha (sem fornecedor → "A definir") (IU-B).
3. Tela `/closing` lista itens no grão fino com **Budget, Realizado, Desvio** corretos para um `ano/mês/unidade`.
4. Itens **sem budget** e **sem realizado** aparecem corretamente (FULL OUTER JOIN).
5. `unit_viewer` só vê sua unidade; admin vê todas.
6. Testes cobrindo os contratos e o cálculo de desvio passam.
