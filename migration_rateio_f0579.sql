-- ============================================================
-- F07 (memória enriquecida) + F09 (períodos fechados). Aditivo/idempotente.
-- ============================================================
BEGIN;

-- F07 — memória de cálculo enriquecida (rateio_results)
ALTER TABLE public.rateio_results
  ADD COLUMN IF NOT EXISTS scenario          text NOT NULL DEFAULT 'ACTUAL'
                                             CHECK (scenario IN ('BUDGET','ACTUAL')),
  ADD COLUMN IF NOT EXISTS criteria_version  integer,
  ADD COLUMN IF NOT EXISTS driver_code       text,
  ADD COLUMN IF NOT EXISTS driver_total      numeric(18,4),
  ADD COLUMN IF NOT EXISTS driver_unit_value numeric(18,4),
  ADD COLUMN IF NOT EXISTS cost_total        numeric(18,2);

CREATE INDEX IF NOT EXISTS idx_rateio_results_period
  ON public.rateio_results (year, month, scenario);

-- F09 — períodos fechados (trava anti-recálculo)
CREATE TABLE IF NOT EXISTS public.closed_periods (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year      integer NOT NULL,
  month     integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  scenario  text NOT NULL DEFAULT 'ALL' CHECK (scenario IN ('ALL','BUDGET','ACTUAL')),
  closed_at timestamptz NOT NULL DEFAULT now(),
  closed_by uuid REFERENCES public.users(id),
  UNIQUE (year, month, scenario)
);

COMMIT;
