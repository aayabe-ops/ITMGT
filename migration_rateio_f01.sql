-- ============================================================
-- F01 — Regra de rateio evoluída
-- driver-entity (allocation_drivers), contrato/serviço, país,
-- unidades participantes, versão, status, apply budget/actual.
-- ADITIVO e IDEMPOTENTE. Não dropa o ENUM driver_type (compat com
-- execute_rateio até o F05). Preserva a(s) regra(s) existente(s).
-- ============================================================
BEGIN;

-- 1) Driver como ENTIDADE (extensível) — D1
CREATE TABLE IF NOT EXISTS public.allocation_drivers (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code       text UNIQUE NOT NULL,
  name       text NOT NULL,
  kind       text NOT NULL DEFAULT 'VALUE' CHECK (kind IN ('EQUAL','VALUE','MANUAL','DIRECT')),
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 1a) Seed canônico (requisito) + legado (preserva os drivers atuais do ENUM)
INSERT INTO public.allocation_drivers (code, name, kind) VALUES
  ('EQUAL','Divisão igualitária','EQUAL'),
  ('USER','Usuários','VALUE'),
  ('LICENSE','Licenças','VALUE'),
  ('HOURS','Horas consumidas','VALUE'),
  ('HEADCOUNT','Colaboradores','VALUE'),
  ('CONSUMPTION','Consumo','VALUE'),
  ('REVENUE','Receita','VALUE'),
  ('MANUAL','Percentual manual','MANUAL'),
  ('DIRECT','100% unidade específica','DIRECT'),
  -- legado (mapeados por kind, para não quebrar critérios/base já existentes)
  ('IGUAL','Igual (legado)','EQUAL'),
  ('FIXO_UNIT','Peso fixo por unidade (legado)','MANUAL'),
  ('USR_AD','Usuários AD (legado)','VALUE'),
  ('USR_SAP','Usuários SAP (legado)','VALUE'),
  ('PALLET_MOV','Pallets movimentados (legado)','VALUE'),
  ('TON_EMB','Toneladas embarcadas (legado)','VALUE'),
  ('AREA_M2','Área m² (legado)','VALUE'),
  ('RECEITA','Receita bruta (legado)','VALUE'),
  ('ENDPOINTS','Endpoints (legado)','VALUE'),
  ('TICKETS','Tickets service desk (legado)','VALUE'),
  ('HRS_PROJ','Horas de projeto (legado)','VALUE')
ON CONFLICT (code) DO NOTHING;

-- 2) Evoluir rateio_criteria (aditivo)
ALTER TABLE public.rateio_criteria
  ADD COLUMN IF NOT EXISTS driver_id        uuid REFERENCES public.allocation_drivers(id),
  ADD COLUMN IF NOT EXISTS contract_id      uuid REFERENCES public.contracts(id),
  ADD COLUMN IF NOT EXISTS country_id       uuid REFERENCES public.countries(id),
  ADD COLUMN IF NOT EXISTS version          integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS status           text    NOT NULL DEFAULT 'DRAFT'
                                            CHECK (status IN ('DRAFT','ACTIVE','INACTIVE')),
  ADD COLUMN IF NOT EXISTS apply_budget     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS apply_actual     boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS base_periodicity text    NOT NULL DEFAULT 'MENSAL',
  ADD COLUMN IF NOT EXISTS base_source      text;

-- 2a) Backfill driver_id a partir do ENUM driver atual (casando por code)
UPDATE public.rateio_criteria rc
   SET driver_id = ad.id
  FROM public.allocation_drivers ad
 WHERE ad.code = rc.driver::text AND rc.driver_id IS NULL;

-- 2b) Critérios que já estavam ativos → ACTIVE (preserva comportamento atual)
UPDATE public.rateio_criteria SET status = 'ACTIVE' WHERE is_active = true AND status = 'DRAFT';

CREATE INDEX IF NOT EXISTS idx_rateio_criteria_lookup
  ON public.rateio_criteria (supplier_id, contract_id, category_id, status);

-- 3) Unidades participantes por regra — D3 (substitui o filtro type='OP')
CREATE TABLE IF NOT EXISTS public.rateio_criteria_units (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  criteria_id uuid NOT NULL REFERENCES public.rateio_criteria(id) ON DELETE CASCADE,
  unit_id     uuid NOT NULL REFERENCES public.units(id),
  UNIQUE (criteria_id, unit_id)
);

COMMIT;

-- Notas:
-- • O ENUM driver_type e a coluna rateio_criteria.driver seguem existindo (compat
--   com execute_rateio). No F05 o motor passa a ler driver_id + rateio_criteria_units
--   e o ENUM é deprecado.
-- • D4 (coluna de origem em budget_lines) entra no F06 (aplicar ao Budget), não aqui.
