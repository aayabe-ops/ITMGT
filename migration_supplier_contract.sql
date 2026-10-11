-- Vigência do contrato e vencimento do pagamento no fornecedor. Idempotente.
BEGIN;
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS contract_start    date,
  ADD COLUMN IF NOT EXISTS contract_end      date,
  ADD COLUMN IF NOT EXISTS payment_due_date  date;
COMMIT;
