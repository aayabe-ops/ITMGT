-- ============================================================
-- Upload de Realizado (CSV) — tabela de status/histórico dos lotes.
-- Idempotente.
-- ============================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.actual_upload_batches (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filename    text,
  country_id  uuid REFERENCES public.countries(id),
  unit_id     uuid REFERENCES public.units(id),   -- nulo quando escopo = país inteiro
  scope       text NOT NULL,                       -- 'UNIT' | 'COUNTRY_FULL'
  year        int  NOT NULL,
  month       int  NOT NULL,
  rows_total  int  NOT NULL DEFAULT 0,
  rows_ok     int  NOT NULL DEFAULT 0,
  rows_err    int  NOT NULL DEFAULT 0,
  status      text NOT NULL DEFAULT 'CONCLUIDO',   -- 'CONCLUIDO' | 'ERRO'
  message     text,
  created_by  uuid REFERENCES public.users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Marca a origem dos lançamentos importados (rastreabilidade)
ALTER TABLE public.actual_lines
  ADD COLUMN IF NOT EXISTS upload_batch_id uuid REFERENCES public.actual_upload_batches(id);

COMMIT;
