-- ============================================================
-- F20 — Catálogo de drivers (premissas) do Rateio TI 2027.
-- Cada premissa PROPORCIONAL vira um driver VALUE, com o nome = texto
-- exato da premissa (usado pelo importador para casar). Aditivo/idempotente.
-- As premissas "Valor por unidade" (DIRETO) e "Nº de unidades" (IGUAL)
-- usam os drivers DIRECT/EQUAL já existentes.
-- ============================================================
BEGIN;

INSERT INTO public.allocation_drivers (code, name, kind) VALUES
  ('P_RECEITA_LIQ',    'Receita líquida',                      'VALUE'),
  ('P_M365',           'Usuários Microsoft 365 licenciados',   'VALUE'),
  ('P_PROTHEUS',       'Usuários Protheus por filial',         'VALUE'),
  ('P_COLETORES',      'Coletores / dispositivos móveis',      'VALUE'),
  ('P_STEFANINI',      'Analistas Stefanini alocados',         'VALUE'),
  ('P_KORBER',         'Usuários WMS Korber',                  'VALUE'),
  ('P_MYSIG',          'Usuários SoftExpert Mysig',            'VALUE'),
  ('P_SALESFORCE',     'Usuários Salesforce',                  'VALUE'),
  ('P_FORTI',          'Computadores com agente Forti',        'VALUE'),
  ('P_AMS_SEIDOR',     'Horas/chamados AMS Seidor',            'VALUE'),
  ('P_SAP_S4',         'Usuários SAP S4 nomeados',             'VALUE'),
  ('P_LINHAS_MOVEIS',  'Linhas móveis ativas',                 'VALUE'),
  ('P_HEADCOUNT',      'Headcount ativo',                      'VALUE'),
  ('P_TRIZZY',         'Uso/chamados Trizzy',                  'VALUE'),
  ('P_EMAINT',         'Usuários eMaint',                      'VALUE'),
  ('P_MHA',            'Chamados MHA',                         'VALUE'),
  ('P_4SYS',           'Horas/chamados 4sys',                  'VALUE'),
  ('P_RAVANEDA',       'Horas/chamados Ravaneda',              'VALUE'),
  ('P_KORBER_MELHORIA','Horas de melhoria Korber',             'VALUE'),
  ('P_ALCIS',          'Usuários Alcis WMS',                   'VALUE'),
  ('P_CERT_SANIT',     'Certificados sanitários',              'VALUE')
ON CONFLICT (code) DO NOTHING;

COMMIT;
