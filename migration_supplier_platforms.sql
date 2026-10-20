-- Fornecedor passa a ter N plataformas atendidas (explícitas), além dos N países.
CREATE TABLE IF NOT EXISTS public.supplier_platforms (
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  platform_id uuid NOT NULL REFERENCES public.platforms(id) ON DELETE CASCADE,
  PRIMARY KEY (supplier_id, platform_id)
);
CREATE INDEX IF NOT EXISTS idx_supplier_platforms_platform ON public.supplier_platforms(platform_id);
