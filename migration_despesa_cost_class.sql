-- Fase 3 (unificação) — Despesa passa a usar cost_class (OPEX/CAPEX/OTC),
-- mesma linguagem de tratamento do resto do sistema. Aposenta o uso de expense_types.
-- Tabela despesas está vazia, então não há backfill.
BEGIN;
ALTER TABLE public.despesas ADD COLUMN IF NOT EXISTS cost_class text;
COMMIT;
