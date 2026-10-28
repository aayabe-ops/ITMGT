-- ============================================================
-- Módulo: Inventário de TI (hardware + licenças) por unidade.
-- Aditivo e idempotente. Não altera tabelas existentes — só lê units/suppliers.
-- Taxonomia ancorada em benchmark ITAM (ITIL/ISO 19770): classes de hardware
-- e de software separadas; hardware = item serializado, software = por quantidade.
-- ============================================================
BEGIN;

DO $$ BEGIN
  CREATE TYPE public.asset_kind AS ENUM ('HARDWARE','SOFTWARE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 1. Grupos / classificação (a taxonomia)
CREATE TABLE IF NOT EXISTS public.asset_groups (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code       text UNIQUE NOT NULL,
  name       text NOT NULL,
  kind       public.asset_kind NOT NULL DEFAULT 'HARDWARE',
  sort       int  NOT NULL DEFAULT 0,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Ativos de hardware (item serializado: nº de série + patrimônio)
CREATE TABLE IF NOT EXISTS public.assets (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_group_id uuid NOT NULL REFERENCES public.asset_groups(id),
  unit_id        uuid NOT NULL REFERENCES public.units(id),
  name           text,                              -- descrição / hostname
  subtype        text,                              -- ex.: Desktop, Notebook, Switch, Router
  manufacturer   text,                              -- fabricante
  model          text,                              -- modelo
  serial_number  text,                              -- número de série
  asset_tag      text,                              -- patrimônio
  os             text,                              -- sistema operacional
  status         text NOT NULL DEFAULT 'EM_USO',    -- EM_USO | ESTOQUE | MANUTENCAO | BAIXADO
  attributes     jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes          text,
  is_active      boolean NOT NULL DEFAULT true,
  created_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_by     uuid,
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_assets_unit  ON public.assets(unit_id);
CREATE INDEX IF NOT EXISTS idx_assets_group ON public.assets(asset_group_id);
-- Patrimônio único quando informado (não bloqueia ativos sem patrimônio)
CREATE UNIQUE INDEX IF NOT EXISTS uq_assets_tag ON public.assets(asset_tag)
  WHERE asset_tag IS NOT NULL AND asset_tag <> '';

-- 3. Licenças / software (por quantidade de usuários/assentos)
CREATE TABLE IF NOT EXISTS public.licenses (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_group_id uuid NOT NULL REFERENCES public.asset_groups(id),
  unit_id        uuid REFERENCES public.units(id),  -- null = corporativa/global
  product        text NOT NULL,
  vendor         text,                              -- fabricante/fornecedor (texto livre)
  supplier_id    uuid REFERENCES public.suppliers(id),
  license_type   text,                              -- PERPETUA | SUBSCRIPTION | SAAS
  metric         text,                              -- USUARIO | DISPOSITIVO | CORE
  seats          int,                               -- quantidade contratada
  seats_used     int,                               -- utilizados
  start_date     date,
  expiry_date    date,                              -- validade / renovação
  attributes     jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes          text,
  is_active      boolean NOT NULL DEFAULT true,
  created_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_by     uuid,
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_licenses_unit  ON public.licenses(unit_id);
CREATE INDEX IF NOT EXISTS idx_licenses_group ON public.licenses(asset_group_id);

-- 4. Seed da taxonomia (benchmark ITAM) — idempotente
INSERT INTO public.asset_groups(code, name, kind, sort) VALUES
  ('HW_SERVER',       'Servidores',                      'HARDWARE', 10),
  ('HW_WORKSTATION',  'Estações de trabalho',            'HARDWARE', 20),
  ('HW_MOBILE',       'Dispositivos móveis / Handhelds', 'HARDWARE', 30),
  ('HW_NETWORK',      'Rede',                            'HARDWARE', 40),
  ('HW_PERIPHERAL',   'Periféricos',                     'HARDWARE', 50),
  ('SW_OS',           'Sistema Operacional',             'SOFTWARE', 60),
  ('SW_PRODUCTIVITY', 'Produtividade / Microsoft',       'SOFTWARE', 70),
  ('SW_SECURITY',     'Segurança',                       'SOFTWARE', 80),
  ('SW_APP',          'Aplicações',                      'SOFTWARE', 90)
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, kind = EXCLUDED.kind, sort = EXCLUDED.sort;

COMMIT;
