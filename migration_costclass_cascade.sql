-- OPEX/CAPEX em cascata: carimba o tratamento EFETIVO nas linhas que estão sem,
-- na precedência linha › fornecedor › categoria. Novas linhas já serão carimbadas
-- na gravação (API); aqui corrigimos o histórico.

-- Budget (coluna text): usa override do fornecedor, senão o padrão da categoria.
UPDATE public.budget_lines bl
   SET cost_class = COALESCE(
         (SELECT s.cost_class::text FROM public.suppliers  s WHERE s.id = bl.supplier_id),
         (SELECT c.cost_class       FROM public.categories c WHERE c.id = bl.category_id))
 WHERE bl.cost_class IS NULL;

-- Realizado (coluna enum cost_class): mesma precedência; categoria (text) é convertida ao enum.
UPDATE public.actual_lines al
   SET cost_class = COALESCE(
         (SELECT s.cost_class             FROM public.suppliers  s WHERE s.id = al.supplier_id),
         (SELECT c.cost_class::cost_class FROM public.categories c WHERE c.id = al.category_id))
 WHERE al.cost_class IS NULL;
