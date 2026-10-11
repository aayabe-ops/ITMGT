-- ============================================================
-- View: vw_closing  (grão FINO: unidade × categoria × fornecedor × projeto × ano × mês)
-- Base da tela de Fechamento Mensal (IU-7). FULL JOIN mostra itens só-budget,
-- só-actual e ambos. Projeto/fornecedor casam com IS NOT DISTINCT FROM (NULL=NULL).
-- Criada em 2026-09-18 — IU-B/IU-7. Não substitui vw_budget_vs_actual (grosso).
-- ============================================================
CREATE OR REPLACE VIEW public.vw_closing AS
WITH b AS (
  SELECT unit_id, category_id, supplier_id, project_id, year, month, SUM(value) AS budgeted
  FROM public.budget_lines
  WHERE is_active = true
  GROUP BY unit_id, category_id, supplier_id, project_id, year, month
),
a AS (
  SELECT unit_id, category_id, supplier_id, project_id, year, month, SUM(value) AS actual
  FROM public.actual_lines
  WHERE origin <> 'RATEADO_ORIGEM'::actual_origin
  GROUP BY unit_id, category_id, supplier_id, project_id, year, month
)
SELECT
  COALESCE(b.unit_id, a.unit_id)         AS unit_id,
  COALESCE(b.category_id, a.category_id) AS category_id,
  COALESCE(b.supplier_id, a.supplier_id) AS supplier_id,
  COALESCE(b.project_id, a.project_id)   AS project_id,
  COALESCE(b.year, a.year)               AS year,
  COALESCE(b.month, a.month)             AS month,
  COALESCE(b.budgeted, 0)                AS budgeted,
  COALESCE(a.actual, 0)                  AS actual,
  COALESCE(a.actual, 0) - COALESCE(b.budgeted, 0) AS variance,
  CASE WHEN COALESCE(b.budgeted, 0) = 0 THEN NULL
       ELSE round((COALESCE(a.actual, 0) - b.budgeted) / b.budgeted * 100, 2)
  END AS variance_pct
FROM b
FULL JOIN a
  ON  b.unit_id = a.unit_id
  AND b.category_id = a.category_id
  AND b.supplier_id IS NOT DISTINCT FROM a.supplier_id
  AND b.project_id  IS NOT DISTINCT FROM a.project_id
  AND b.year = a.year
  AND b.month = a.month;
