-- Correção da cascata OPEX/CAPEX/OTC: a classificação é definida no LANÇAMENTO (linha),
-- e a CATEGORIA é o padrão. O FORNECEDOR não define. Aqui re-carimbamos o histórico
-- a partir da categoria (removendo o OPEX que vinha forçado pelo fornecedor).
UPDATE public.budget_lines bl
   SET cost_class = (SELECT c.cost_class FROM public.categories c WHERE c.id = bl.category_id)
 WHERE bl.is_active;

UPDATE public.actual_lines al
   SET cost_class = (SELECT c.cost_class::cost_class FROM public.categories c WHERE c.id = al.category_id);
