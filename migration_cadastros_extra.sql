-- ============================================================
-- Novos cadastros: Despesa, Solution Type, Alocação. Idempotente.
-- ============================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.expense_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL, name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.solution_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL, name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL, name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);

-- Seeds (não duplica: ON CONFLICT no code)
INSERT INTO public.expense_types (code, name) VALUES
  ('CAPEX','CAPEX'), ('OPEX','OPEX'), ('OPEX-OTC','OPEX OTC')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.solution_types (code, name) VALUES
  ('INFRA-TI','Infraestrutura TI'), ('TELECOM','Telecom'), ('CYBER','Cyber Security'),
  ('APPLICATION','Application'), ('ERP','ERP'), ('WMS','WMS'), ('CLOUD','Cloud')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.allocations (code, name) VALUES
  ('PLATAFORMA','Plataforma'), ('INTEGRATION','Integration'),
  ('HOLDING','Holding'), ('CORPORATE','Corporate')
ON CONFLICT (code) DO NOTHING;

COMMIT;
