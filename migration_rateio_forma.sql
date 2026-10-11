-- Simplificação do rateio: a regra passa a guardar a "forma" escolhida no assistente,
-- em linguagem de negócio (não jargão de driver):
--   IGUAL | QUANTIDADE | PERCENTUAL | DIRETO
-- QUANTIDADE e PERCENTUAL usam o mesmo driver MANUAL (números por regra em rateio_unit_weights);
-- o motor normaliza por soma, então os dois são a mesma conta. IGUAL=EQUAL, DIRETO=DIRECT.
ALTER TABLE public.rateio_criteria ADD COLUMN IF NOT EXISTS forma text;

-- backfill das regras existentes a partir do tipo do driver atual
UPDATE public.rateio_criteria rc
   SET forma = CASE ad.kind
       WHEN 'EQUAL'  THEN 'IGUAL'
       WHEN 'DIRECT' THEN 'DIRETO'
       WHEN 'MANUAL' THEN 'PERCENTUAL'
       WHEN 'VALUE'  THEN 'QUANTIDADE'
       ELSE 'IGUAL' END
  FROM public.allocation_drivers ad
 WHERE ad.id = rc.driver_id AND rc.forma IS NULL;
