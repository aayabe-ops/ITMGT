-- ============================================================
-- Migração — Módulo de Cadastros (fornecedor, tipos, projetos)
-- Idempotente: pode rodar mais de uma vez sem erro.
-- ============================================================
BEGIN;

-- 1. Enums (CAPEX/OPEX/OTC e RATEIO/DIRETO)
DO $$ BEGIN
  CREATE TYPE public.cost_class AS ENUM ('CAPEX','OPEX','OTC');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.expense_mode AS ENUM ('RATEIO','DIRETO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Tabela: Tipos de Fornecedor
CREATE TABLE IF NOT EXISTS public.supplier_types (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code       text UNIQUE NOT NULL,
  name       text NOT NULL,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Tabela: Projetos (código de projeto)
CREATE TABLE IF NOT EXISTS public.projects (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code       text UNIQUE NOT NULL,
  name       text NOT NULL,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Fornecedor: novas dimensões
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS short_name       text,
  ADD COLUMN IF NOT EXISTS supplier_type_id uuid REFERENCES public.supplier_types(id),
  ADD COLUMN IF NOT EXISTS category_id      uuid REFERENCES public.categories(id),
  ADD COLUMN IF NOT EXISTS expense_mode     public.expense_mode NOT NULL DEFAULT 'DIRETO',
  ADD COLUMN IF NOT EXISTS unit_id          uuid REFERENCES public.units(id),
  ADD COLUMN IF NOT EXISTS cost_class       public.cost_class NOT NULL DEFAULT 'OPEX',
  ADD COLUMN IF NOT EXISTS project_id       uuid REFERENCES public.projects(id);

-- 5. Realizado: CAPEX/OPEX/OTC e projeto por linha (herdados do fornecedor, editáveis)
ALTER TABLE public.actual_lines
  ADD COLUMN IF NOT EXISTS cost_class public.cost_class,
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id);

COMMIT;
