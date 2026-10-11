-- Liga G&A Group e Centro de Custo ao fornecedor. Idempotente.
BEGIN;
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS ga_group_id    uuid REFERENCES public.ga_groups(id),
  ADD COLUMN IF NOT EXISTS cost_center_id uuid REFERENCES public.cost_centers(id);
COMMIT;
