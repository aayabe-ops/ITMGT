-- ============================================================
-- Alinhamento ao template: Empresa, Moeda/Câmbio, Centro de Custo, G&A Group.
-- Hierarquia: Plataforma → País → Empresa → Unidade. Idempotente.
-- ============================================================
BEGIN;

-- Moedas
CREATE TABLE IF NOT EXISTS public.currencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL, name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.currencies (code, name) VALUES
  ('BRL','Real (Brasil)'), ('USD','Dólar americano'), ('UYU','Peso uruguaio'),
  ('PYG','Guarani (Paraguai)'), ('ARS','Peso argentino'), ('CLP','Peso chileno'),
  ('COP','Peso colombiano'), ('PEN','Sol (Peru)')
ON CONFLICT (code) DO NOTHING;

-- Empresas (entre País e Unidade)
CREATE TABLE IF NOT EXISTS public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL, name text NOT NULL,
  country_id uuid REFERENCES public.countries(id),
  is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);

-- Centros de custo (por Empresa)
CREATE TABLE IF NOT EXISTS public.cost_centers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL, name text NOT NULL,
  company_id uuid REFERENCES public.companies(id),
  is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);

-- G&A Group
CREATE TABLE IF NOT EXISTS public.ga_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL, name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.ga_groups (code, name) VALUES ('GA-CORP','G&A Corporate')
ON CONFLICT (code) DO NOTHING;

-- País ganha moeda local; Unidade ganha empresa
ALTER TABLE public.countries ADD COLUMN IF NOT EXISTS currency_id uuid REFERENCES public.currencies(id);
ALTER TABLE public.units      ADD COLUMN IF NOT EXISTS company_id  uuid REFERENCES public.companies(id);

-- Câmbio: taxa da moeda local por 1 USD, por país e ano (month NULL = anual)
CREATE TABLE IF NOT EXISTS public.exchange_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_id uuid NOT NULL REFERENCES public.countries(id),
  year int NOT NULL,
  month int,                      -- NULL = taxa anual
  usd_rate numeric(15,6) NOT NULL, -- quanto da moeda local vale 1 USD (ex.: BRL 5.88)
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (country_id, year, month)
);

COMMIT;
