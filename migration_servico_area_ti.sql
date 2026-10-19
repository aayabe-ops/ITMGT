-- Área de TI (solution_type) passa a ser atributo do SERVIÇO (antes ficava no fornecedor).
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS solution_type_id uuid REFERENCES public.solution_types(id);
