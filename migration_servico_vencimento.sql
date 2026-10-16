-- Vencimento do pagamento é condição do serviço/contrato (antes ficava no fornecedor).
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS payment_due_date date;
