-- EXCLUSÃO (confirmada pelo usuário em 2026-10-15; backup pre_delete feito):
-- fornecedores + realizado + budget 2026/2027 + regras de rateio (cascata FK).
-- Mantém estrutura, cadastros-base, drivers/bases e usuários.
BEGIN;
DELETE FROM public.rateio_results;
DELETE FROM public.rateio_unit_weights;
DELETE FROM public.rateio_criteria_units;
DELETE FROM public.rateio_criteria;
DELETE FROM public.actual_lines;
DELETE FROM public.budget_lines WHERE year IN (2026, 2027);
DELETE FROM public.despesas WHERE supplier_id IS NOT NULL;
DELETE FROM public.contracts;
DELETE FROM public.supplier_countries;
DELETE FROM public.suppliers;
COMMIT;
