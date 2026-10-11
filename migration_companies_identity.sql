-- ============================================================
-- Empresas: uma empresa pode ter vários sites (Unidade × Divisão).
-- Troca a unicidade de 'code' para (code, unidade, divisao_id).
-- Aditivo/idempotente.
-- ============================================================
BEGIN;

-- garante as colunas de estrutura (caso ainda não existam)
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS divisao_id   text,
  ADD COLUMN IF NOT EXISTS divisao_nome text,
  ADD COLUMN IF NOT EXISTS unidade      text,
  ADD COLUMN IF NOT EXISTS unidade_id   uuid REFERENCES public.unidades(id),
  ADD COLUMN IF NOT EXISTS cidade       text;

-- remove a unicidade só por código (permitia 1 registro por empresa)
ALTER TABLE public.companies DROP CONSTRAINT IF EXISTS companies_code_key;
DROP INDEX IF EXISTS public.companies_code_key;

-- nova identidade: empresa + unidade + divisão
CREATE UNIQUE INDEX IF NOT EXISTS companies_identity_uk
  ON public.companies(code, unidade, divisao_id);

COMMIT;
