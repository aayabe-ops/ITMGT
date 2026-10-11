-- ============================================================
-- View: vw_budget_vs_actual  (grão grosso: unidade × categoria × ano × mês)
-- Usada por Dashboard e Relatório.
-- Fonte original extraída do banco (pg_get_viewdef) em 2026-09-18 — IU-0.
--
-- NOTA (IU-B): a versão original usava `b.value` direto no GROUP BY,
-- assumindo 1 budget ativo por célula. Com o Budget enriquecido
-- (supplier_id/project_id), passam a existir várias linhas de budget por
-- célula → é obrigatório SOMAR o budget. Esta versão soma budget e actual
-- de forma robusta, mantendo as MESMAS colunas de saída.
-- ============================================================
CREATE OR REPLACE VIEW public.vw_budget_vs_actual AS
WITH b AS (
  SELECT unit_id, category_id, year, month, SUM(value) AS budgeted
  FROM public.budget_lines
  WHERE is_active = true
  GROUP BY unit_id, category_id, year, month
),
a AS (
  SELECT unit_id, category_id, year, month, SUM(value) AS actual
  FROM public.actual_lines
  WHERE origin <> 'RATEADO_ORIGEM'::actual_origin
  GROUP BY unit_id, category_id, year, month
)
SELECT
  unit_id, category_id, year, month,
  COALESCE(b.budgeted, 0) AS budgeted,
  COALESCE(a.actual, 0)   AS actual,
  COALESCE(a.actual, 0) - COALESCE(b.budgeted, 0) AS variance,
  CASE WHEN COALESCE(b.budgeted, 0) = 0 THEN NULL
       ELSE round((COALESCE(a.actual, 0) - b.budgeted) / b.budgeted * 100, 2)
  END AS variance_pct
FROM b
FULL JOIN a USING (unit_id, category_id, year, month);
