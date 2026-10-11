-- Budget: guarda também descrição, KPI e moeda por linha (dimensões do orçamento).
BEGIN;
ALTER TABLE public.budget_lines
  ADD COLUMN IF NOT EXISTS descricao text,
  ADD COLUMN IF NOT EXISTS kpi      text,
  ADD COLUMN IF NOT EXISTS currency text;
COMMIT;
