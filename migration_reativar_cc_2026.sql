-- Reativa TODOS os centros de custo que têm orçamento ou realizado em 2026,
-- para que o orçado × realizado apareça completo no dashboard/relatórios.
UPDATE public.units SET is_active = true
 WHERE is_active = false AND id IN (
   SELECT unit_id FROM public.budget_lines WHERE year = 2026 AND is_active
   UNION
   SELECT unit_id FROM public.actual_lines WHERE year = 2026
 );
