-- Fase 3 — Tratamento contábil (OPEX/CAPEX) no CUSTO, não só no fornecedor.
-- Categoria passa a carregar o tratamento (natureza do custo); a linha de budget
-- pode sobrepor. O painel usa COALESCE(linha, fornecedor, categoria).
BEGIN;
ALTER TABLE public.categories    ADD COLUMN IF NOT EXISTS cost_class text;
ALTER TABLE public.budget_lines  ADD COLUMN IF NOT EXISTS cost_class text;
COMMIT;
