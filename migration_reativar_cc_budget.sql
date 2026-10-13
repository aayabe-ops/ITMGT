-- Reativa os centros de custo onde está o orçamento 2026 (nomeados por filial),
-- para que o realizado seja carregado neles e reconcilie orçado × realizado.
UPDATE public.units SET is_active = true
 WHERE code IN ('PARANAGU','ITAJA','RIO-GRANDE','PONTA-GROSSA','PASSO-FUNDO','RECIFE-2','TRANSPORTES')
   AND is_active = false;
