-- Correção: o inventário é por UNIDADE (public.unidades, o site), não por
-- Centro de Custo (public.units). Tabelas de inventário ainda vazias → troca limpa.
BEGIN;

ALTER TABLE public.assets   DROP CONSTRAINT IF EXISTS assets_unit_id_fkey;
ALTER TABLE public.licenses DROP CONSTRAINT IF EXISTS licenses_unit_id_fkey;
DROP INDEX IF EXISTS public.idx_assets_unit;
DROP INDEX IF EXISTS public.idx_licenses_unit;

ALTER TABLE public.assets   DROP COLUMN IF EXISTS unit_id;
ALTER TABLE public.licenses DROP COLUMN IF EXISTS unit_id;

ALTER TABLE public.assets   ADD COLUMN IF NOT EXISTS unidade_id uuid NOT NULL REFERENCES public.unidades(id);
ALTER TABLE public.licenses ADD COLUMN IF NOT EXISTS unidade_id uuid          REFERENCES public.unidades(id);

CREATE INDEX IF NOT EXISTS idx_assets_unidade   ON public.assets(unidade_id);
CREATE INDEX IF NOT EXISTS idx_licenses_unidade ON public.licenses(unidade_id);

COMMIT;
