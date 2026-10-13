-- Desfaz a carga 'import_xlsx' (duplicada): o realizado 2026 já existia (source 'upload').
-- Mantém a carga anterior intacta. A reativação dos CCs do budget permanece.
DELETE FROM public.actual_lines WHERE year=2026 AND source='import_xlsx';
