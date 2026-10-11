-- "Tipos de Fornecedor" vira "Grupo" (agrupa Categorias). Reaproveita a tabela
-- supplier_types (que estava vazia) como master de Grupo. Categorias ganham grupo_id.
BEGIN;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS grupo_id uuid REFERENCES public.supplier_types(id);

-- Grupos (taxonomia de TI) — base editável
INSERT INTO public.supplier_types (code, name) VALUES
  ('APLIC-SOFTWARE', 'Aplicações & Software'),
  ('INFRA-CLOUD',    'Infraestrutura & Cloud'),
  ('TELECOM',        'Telecom & Conectividade'),
  ('SEGURANCA',      'Segurança da Informação'),
  ('WORKPLACE',      'Workplace & Usuário Final'),
  ('SERV-MANUT',     'Serviços & Manutenção de TI'),
  ('PESSOAS',        'Pessoas de TI'),
  ('DESP-GERAIS',    'Despesas Gerais & Viagens')
ON CONFLICT (code) DO NOTHING;
COMMIT;
