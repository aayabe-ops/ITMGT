-- Fase 5 — Governança de driver: registra quando e por quem a base foi atualizada.
BEGIN;
ALTER TABLE public.driver_values
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES public.users(id);
COMMIT;
