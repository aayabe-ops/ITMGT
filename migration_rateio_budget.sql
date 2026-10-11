-- Rateio de BUDGET (torna real a opção "Aplica no Budget").
-- A regra carrega o valor mensal a ratear; o motor grava linhas de budget
-- marcadas source='rateio' (idempotentes, reaplicáveis).
BEGIN;
ALTER TABLE public.budget_lines   ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE public.rateio_criteria ADD COLUMN IF NOT EXISTS budget_value numeric;
COMMIT;
