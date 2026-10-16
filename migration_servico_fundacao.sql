-- R1 — Serviço = Contrato enriquecido. Aditivo (não quebra nada).
-- 1) o serviço/contrato ganha modo (direto/rateio).
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS expense_mode text NOT NULL DEFAULT 'DIRETO';
-- 2) budget e realizado passam a poder apontar para um serviço (chave explícita de reconciliação).
ALTER TABLE public.budget_lines ADD COLUMN IF NOT EXISTS service_id uuid REFERENCES public.contracts(id);
ALTER TABLE public.actual_lines ADD COLUMN IF NOT EXISTS service_id uuid REFERENCES public.contracts(id);
CREATE INDEX IF NOT EXISTS idx_budget_lines_service ON public.budget_lines(service_id);
CREATE INDEX IF NOT EXISTS idx_actual_lines_service ON public.actual_lines(service_id);
