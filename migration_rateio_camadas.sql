-- Fase 5 — Rateio em camadas (MVP). Regras ganham ordem de execução e seletor de origem.
-- step_order=1 + source_origin='INICIAL' reproduz o motor atual (zero regressão).
--   source_origin: 'INICIAL' (custos RATEADO_ORIGEM) ou 'CAMADA:<n>' (saída da camada n)
--   source_unit_id: para camadas >1, o CC-hub cujo valor a regra redistribui
BEGIN;
ALTER TABLE public.rateio_criteria
  ADD COLUMN IF NOT EXISTS step_order     int  NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS source_origin  text NOT NULL DEFAULT 'INICIAL',
  ADD COLUMN IF NOT EXISTS source_unit_id uuid REFERENCES public.units(id);
COMMIT;
