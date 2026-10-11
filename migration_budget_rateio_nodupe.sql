-- Anti-dobra do rateio de Budget.
-- Marca as linhas de budget (upload/manual) que o rateio CONSUMIU (neutralizou)
-- ao redistribuí-las pelos CCs. Linhas neutralizadas ficam is_active=false (somem
-- dos relatórios), mas são reativadas automaticamente a cada reaplicação do rateio
-- ou quando a regra é removida — por isso o flag, para sabermos quais reativar.
ALTER TABLE public.budget_lines
  ADD COLUMN IF NOT EXISTS neutralized_by_rateio boolean NOT NULL DEFAULT false;

-- índice para o reset/consulta por fornecedor+categoria no ano
CREATE INDEX IF NOT EXISTS budget_lines_rateio_src_idx
  ON public.budget_lines (year, supplier_id, category_id)
  WHERE source <> 'rateio';
