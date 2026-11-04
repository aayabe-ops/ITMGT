-- Trilha de auditoria: acessos (login/logout) e ações (create/update/delete/import).
-- Aditiva. Nenhum dado existente é alterado.
CREATE TABLE IF NOT EXISTS public.audit_log (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ts         timestamptz NOT NULL DEFAULT now(),
  user_id    uuid,
  user_email text,
  action     text NOT NULL,       -- LOGIN_OK | LOGIN_FAIL | LOGOUT | CREATE | UPDATE | DELETE | IMPORT | LANG
  entity     text,                -- tabela/recurso afetado
  entity_id  text,
  detail     text,                -- descrição curta e legível
  ip         text
);
CREATE INDEX IF NOT EXISTS idx_audit_ts     ON public.audit_log(ts DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user   ON public.audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON public.audit_log(action);
