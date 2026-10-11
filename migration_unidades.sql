-- Unidade agrupa vários Centros de Custo (units).
-- Uma Unidade (nova tabela) contém N Centros de Custo via units.unidade_id.
BEGIN;

CREATE TABLE IF NOT EXISTS public.unidades (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code       text UNIQUE NOT NULL,
  name       text NOT NULL,
  country_id uuid REFERENCES public.countries(id),
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.units ADD COLUMN IF NOT EXISTS unidade_id uuid REFERENCES public.unidades(id);
CREATE INDEX IF NOT EXISTS idx_units_unidade_id ON public.units(unidade_id);

-- Empresa também referencia a Unidade (agrupador) — substitui o campo texto antigo
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS unidade_id uuid REFERENCES public.unidades(id);

COMMIT;
