-- Drivers: unidade de medida (métrica + rótulo) e limpeza dos drivers legados.

-- 1) Campos de unidade de medida
ALTER TABLE public.allocation_drivers
  ADD COLUMN IF NOT EXISTS metric     text,
  ADD COLUMN IF NOT EXISTS unit_label text;

-- 2) Reatribui regras que ainda usam o driver IGUAL (legado) para EQUAL
--    (comportamento idêntico: divisão igualitária), para poder apagar o legado.
UPDATE public.rateio_criteria rc
   SET driver_id = (SELECT id FROM public.allocation_drivers WHERE code='EQUAL' LIMIT 1)
 WHERE rc.driver_id IN (SELECT id FROM public.allocation_drivers WHERE code='IGUAL');

-- 3) Apaga os drivers legados que não estão mais em uso (regras/bases)
DELETE FROM public.allocation_drivers d
 WHERE d.name ILIKE '%legado%'
   AND NOT EXISTS (SELECT 1 FROM public.rateio_criteria rc WHERE rc.driver_id=d.id)
   AND NOT EXISTS (SELECT 1 FROM public.driver_values dv WHERE dv.driver_id=d.id);

-- 4) Backfill da métrica pelo tipo de cálculo
UPDATE public.allocation_drivers SET metric='NENHUMA'
 WHERE kind IN ('DIRECT','EQUAL') AND metric IS NULL;
UPDATE public.allocation_drivers SET metric='PERCENTUAL', unit_label=COALESCE(unit_label,'%')
 WHERE kind='MANUAL' AND metric IS NULL;
UPDATE public.allocation_drivers SET metric='QUANTIDADE'
 WHERE kind='VALUE' AND metric IS NULL;

-- 5) Overrides de unidade para os casos óbvios
UPDATE public.allocation_drivers SET metric='VALOR', unit_label=COALESCE(unit_label,'R$')
 WHERE code IN ('REVENUE','P_RECEITA_LIQ');
UPDATE public.allocation_drivers SET metric='HORA', unit_label=COALESCE(unit_label,'Horas')
 WHERE code IN ('HOURS','P_4SYS','P_AMS_SEIDOR','P_RAVANEDA','P_KORBER_MELHORIA');
UPDATE public.allocation_drivers SET unit_label=COALESCE(unit_label,'Licenças')
 WHERE code='LICENSE';
UPDATE public.allocation_drivers SET unit_label=COALESCE(unit_label,'Colaboradores')
 WHERE code IN ('HEADCOUNT','P_HEADCOUNT');
UPDATE public.allocation_drivers SET unit_label=COALESCE(unit_label,'Usuários')
 WHERE code IN ('USER','P_M365','P_SAP_S4','P_SALESFORCE','P_PROTHEUS','P_ALCIS','P_EMAINT','P_MYSIG','P_KORBER');
UPDATE public.allocation_drivers SET unit_label=COALESCE(unit_label,'Dispositivos')
 WHERE code IN ('P_COLETORES','P_LINHAS_MOVEIS');
