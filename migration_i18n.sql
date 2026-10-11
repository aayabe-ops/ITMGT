-- Idioma preferido do usuário (pt | es | en)
BEGIN;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS lang text NOT NULL DEFAULT 'pt';
COMMIT;
