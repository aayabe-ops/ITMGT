-- Limpeza de CCs duplicados (mesmo site, formato de código diferente) para que a
-- unidade passe a ter 1 CC e o import resolva o CC pela unidade automaticamente.
-- Desativa (is_active=false) — reversível. Mantém o CC "principal" (mais dados/código limpo).
-- NÃO toca em Londrina/Transporte (são entidades distintas, não duplicatas).
UPDATE public.units SET is_active = false
 WHERE id IN (
   '9f0748b0-4953-4e95-978c-df5f7c0107f2',  -- BEBEDOURO 1  (duplicata de BEBEDOURO I)
   '7cc3e635-b725-450d-a653-ce0a722b5262',  -- BEBEDOURO 2  (duplicata de BEBEDOURO II)
   '99853573-72df-47e8-b500-ae4f75521b46'   -- SÃO JOSE DOS PINHAIS (duplicata, vazio)
 );
