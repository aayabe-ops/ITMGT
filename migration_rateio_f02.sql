-- ============================================================
-- F02 — Base mensal dos drivers
-- Alinha driver_values ao driver-entity (allocation_drivers) e adiciona
-- cenário BUDGET/ACTUAL (base planejada × efetiva). Aditivo e idempotente.
-- driver_values está vazia hoje → reestruturação segura.
-- ============================================================
BEGIN;

ALTER TABLE public.driver_values
  ADD COLUMN IF NOT EXISTS driver_id uuid REFERENCES public.allocation_drivers(id),
  ADD COLUMN IF NOT EXISTS scenario  text NOT NULL DEFAULT 'ACTUAL'
                                      CHECK (scenario IN ('BUDGET','ACTUAL'));

-- Backfill driver_id a partir do ENUM antigo (por code). Idempotente.
UPDATE public.driver_values dv
   SET driver_id = ad.id
  FROM public.allocation_drivers ad
 WHERE ad.code = dv.driver::text AND dv.driver_id IS NULL;

-- O ENUM driver deixa de ser obrigatório (drivers canônicos novos não existem no ENUM).
ALTER TABLE public.driver_values ALTER COLUMN driver DROP NOT NULL;

-- Unicidade agora por driver_id + cenário.
ALTER TABLE public.driver_values DROP CONSTRAINT IF EXISTS driver_values_uk;
CREATE UNIQUE INDEX IF NOT EXISTS driver_values_uk2
  ON public.driver_values (unit_id, driver_id, year, month, scenario);

COMMIT;
