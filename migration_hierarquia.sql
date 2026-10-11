-- ============================================================
-- Migração — Hierarquia Plataforma → País → Unidade
-- + Fornecedor N:N País. Idempotente.
-- ============================================================
BEGIN;

-- Plataformas (3)
CREATE TABLE IF NOT EXISTS public.platforms (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code       text UNIQUE NOT NULL,
  name       text NOT NULL,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Países (11) → pertencem a uma plataforma
CREATE TABLE IF NOT EXISTS public.countries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text UNIQUE NOT NULL,
  name        text NOT NULL,
  platform_id uuid REFERENCES public.platforms(id),
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Unidade pertence a um país
ALTER TABLE public.units
  ADD COLUMN IF NOT EXISTS country_id uuid REFERENCES public.countries(id);

-- Fornecedor N:N País (pode atender vários países)
CREATE TABLE IF NOT EXISTS public.supplier_countries (
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  country_id  uuid NOT NULL REFERENCES public.countries(id) ON DELETE CASCADE,
  PRIMARY KEY (supplier_id, country_id)
);

-- Usuário também recebe plataforma / país (unit_id já existe)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS platform_id uuid REFERENCES public.platforms(id),
  ADD COLUMN IF NOT EXISTS country_id  uuid REFERENCES public.countries(id);

COMMIT;
