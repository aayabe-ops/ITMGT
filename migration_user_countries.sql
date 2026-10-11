-- ============================================================
-- Perfil Multi-País: um usuário pode ver 1+ países (de uma plataforma).
-- N:N usuário ↔ país. Aditivo e idempotente.
-- ============================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.user_countries (
  user_id    uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  country_id uuid NOT NULL REFERENCES public.countries(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, country_id)
);
CREATE INDEX IF NOT EXISTS idx_user_countries_user ON public.user_countries(user_id);

COMMIT;
