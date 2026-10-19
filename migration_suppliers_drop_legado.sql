-- R4 (fim) — fornecedor = identidade. Os atributos operacionais migraram para o
-- Serviço (contracts) e todos os leitores foram repontados. Agora removemos as
-- colunas mortas de suppliers. Mantém: id, cnpj, name, short_name, supplier_type_id,
-- is_active, created_at. Os TIPOS enum expense_mode/cost_class continuam (usados em
-- contracts/actual_lines/budget_lines) — só as COLUNAS de suppliers saem.
ALTER TABLE public.suppliers
  DROP COLUMN IF EXISTS category_id,
  DROP COLUMN IF EXISTS expense_mode,
  DROP COLUMN IF EXISTS unit_id,
  DROP COLUMN IF EXISTS cost_class,
  DROP COLUMN IF EXISTS project_id,
  DROP COLUMN IF EXISTS ga_group_id,
  DROP COLUMN IF EXISTS cost_center_id,
  DROP COLUMN IF EXISTS solution_type_id,
  DROP COLUMN IF EXISTS contract_start,
  DROP COLUMN IF EXISTS contract_end,
  DROP COLUMN IF EXISTS payment_due_date;
