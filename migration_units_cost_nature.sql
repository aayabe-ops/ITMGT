-- Natureza do custo por Centro de Custo (unidade), para o relatório COGS × G&A × Holding × Transporte.
-- COGS = operação do site; G&A = back-office; HOLDING = projetos; TRANSPORTE = Transporte (DMX).
ALTER TABLE public.units ADD COLUMN IF NOT EXISTS cost_nature text NOT NULL DEFAULT 'COGS';
