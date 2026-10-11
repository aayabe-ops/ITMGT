-- ============================================================
-- F21 — Suporte ao importador do Excel de rateio.
-- ext_ref guarda o ID do contrato da planilha (C001…) para reimport idempotente.
-- Aditivo/idempotente.
-- ============================================================
BEGIN;

ALTER TABLE public.rateio_criteria ADD COLUMN IF NOT EXISTS ext_ref text;
CREATE UNIQUE INDEX IF NOT EXISTS rateio_criteria_ext_ref_uk
  ON public.rateio_criteria(ext_ref) WHERE ext_ref IS NOT NULL;

COMMIT;
