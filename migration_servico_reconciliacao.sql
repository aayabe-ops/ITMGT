-- R3 — Reconciliação por serviço. service_id passa a ser carimbado em TODA escrita
-- de budget_lines e actual_lines (manual, import, CSV, rateio), resolvido a partir
-- de fornecedor + categoria + unidade contra o serviço (contrato) ativo correspondente.
-- Aditivo e seguro: só preenche quando service_id está nulo; nunca sobrescreve.

-- Índice p/ a resolução ser barata no loop de import.
CREATE INDEX IF NOT EXISTS idx_contracts_sup_cat
  ON public.contracts(supplier_id, category_id) WHERE is_active;

-- Resolve o serviço a partir de (fornecedor, categoria, unidade).
-- Preferência: serviço com a MESMA unidade (direto) > serviço sem unidade (rateio) > mais recente.
CREATE OR REPLACE FUNCTION public.resolve_service_id() RETURNS trigger AS $$
BEGIN
  IF NEW.service_id IS NULL AND NEW.supplier_id IS NOT NULL AND NEW.category_id IS NOT NULL THEN
    SELECT ct.id INTO NEW.service_id
      FROM public.contracts ct
     WHERE ct.is_active = true
       AND ct.supplier_id = NEW.supplier_id
       AND ct.category_id = NEW.category_id
       AND (ct.unit_id = NEW.unit_id OR ct.unit_id IS NULL)
     ORDER BY (ct.unit_id IS NOT DISTINCT FROM NEW.unit_id) DESC, ct.created_at DESC
     LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_resolve_service_budget ON public.budget_lines;
CREATE TRIGGER trg_resolve_service_budget
  BEFORE INSERT OR UPDATE OF supplier_id, category_id, unit_id ON public.budget_lines
  FOR EACH ROW EXECUTE FUNCTION public.resolve_service_id();

DROP TRIGGER IF EXISTS trg_resolve_service_actual ON public.actual_lines;
CREATE TRIGGER trg_resolve_service_actual
  BEFORE INSERT OR UPDATE OF supplier_id, category_id, unit_id ON public.actual_lines
  FOR EACH ROW EXECUTE FUNCTION public.resolve_service_id();

-- Backfill do que já existir (base atual está vazia; roda sem efeito, mas deixa pronto).
UPDATE public.budget_lines bl SET service_id = ct.id
  FROM public.contracts ct
 WHERE bl.service_id IS NULL AND bl.supplier_id IS NOT NULL AND bl.category_id IS NOT NULL
   AND ct.is_active = true AND ct.supplier_id = bl.supplier_id AND ct.category_id = bl.category_id
   AND (ct.unit_id = bl.unit_id OR ct.unit_id IS NULL);

UPDATE public.actual_lines al SET service_id = ct.id
  FROM public.contracts ct
 WHERE al.service_id IS NULL AND al.supplier_id IS NOT NULL AND al.category_id IS NOT NULL
   AND ct.is_active = true AND ct.supplier_id = al.supplier_id AND ct.category_id = al.category_id
   AND (ct.unit_id = al.unit_id OR ct.unit_id IS NULL);
