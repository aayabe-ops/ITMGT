-- Higiene de cadastro: dedupe das 17 unidades repetidas + tratamento dos 66 CCs órfãos.
-- Estratégia: DESATIVAR (is_active=false), nunca DELETE — reversível e sem risco de FK
-- (7 tabelas referenciam unidades). Trava: CC com budget/realizado NUNCA é desativado.

BEGIN;

-- 1) Cria unidades novas para os buckets órfãos com dinheiro (se ainda não existirem)
INSERT INTO public.unidades (code, name)
SELECT v.code, v.name FROM (VALUES
  ('CORPORATIVO','Corporativo'),
  ('TRANSPORTE','Transporte'),
  ('VARZEA-GRANDE','Várzea Grande')
) AS v(code, name)
WHERE NOT EXISTS (SELECT 1 FROM public.unidades u WHERE u.name = v.name);

-- 2) Vincula os 4 CCs órfãos com dinheiro às unidades novas
UPDATE public.units u SET unidade_id = (SELECT id FROM public.unidades WHERE name='Corporativo' LIMIT 1)
 WHERE u.code = 'CORPORATIVO' AND u.unidade_id IS NULL;
UPDATE public.units u SET unidade_id = (SELECT id FROM public.unidades WHERE name='Transporte' LIMIT 1)
 WHERE u.code IN ('TRANSPORTE','TRANSPORTE MM') AND u.unidade_id IS NULL;
UPDATE public.units u SET unidade_id = (SELECT id FROM public.unidades WHERE name='Várzea Grande' LIMIT 1)
 WHERE u.code = 'VARZEA GRANDE' AND u.unidade_id IS NULL;

-- 3) Desativa os CCs órfãos restantes (vazios). TRAVA: nunca desativa quem tem budget/realizado.
UPDATE public.units SET is_active = false
 WHERE unidade_id IS NULL AND is_active = true
   AND NOT EXISTS (SELECT 1 FROM public.budget_lines b WHERE b.unit_id = units.id AND b.is_active = true)
   AND NOT EXISTS (SELECT 1 FROM public.actual_lines a WHERE a.unit_id = units.id AND a.origin = 'DIRETO');

-- 4) Dedupe das unidades com nome repetido.
--    Survivor por nome: prefere código não-"ComFrio", depois mais CCs ativos, depois id estável.
--    Move os CCs das perdedoras para a survivor e DESATIVA as perdedoras.
CREATE TEMP TABLE _dedup ON COMMIT DROP AS
WITH ranked AS (
  SELECT ud.id, ud.name,
         row_number() OVER (PARTITION BY ud.name ORDER BY
           (ud.code LIKE 'ComFrio%') ASC,
           (SELECT count(*) FROM public.units u WHERE u.unidade_id = ud.id AND u.is_active = true) DESC,
           ud.id ASC) AS rn
    FROM public.unidades ud
   WHERE ud.is_active = true
     AND ud.name IN (SELECT name FROM public.unidades WHERE is_active = true GROUP BY name HAVING count(*) > 1)
)
SELECT r.id AS loser_id, k.id AS keep_id
  FROM ranked r
  JOIN (SELECT name, id FROM ranked WHERE rn = 1) k ON k.name = r.name
 WHERE r.rn > 1;

UPDATE public.units u SET unidade_id = d.keep_id FROM _dedup d WHERE u.unidade_id = d.loser_id;
UPDATE public.unidades SET is_active = false WHERE id IN (SELECT loser_id FROM _dedup);

COMMIT;
