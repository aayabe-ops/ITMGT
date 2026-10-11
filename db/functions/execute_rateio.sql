-- ============================================================
-- Função: execute_rateio(p_year, p_month)
-- Distribui linhas RATEADO_ORIGEM entre unidades OP, gerando
-- linhas RATEADO_ADM em actual_lines e registros em rateio_results.
-- Fonte: extraída do banco (pg_get_functiondef) em 2026-09-18 — IU-0.
-- Depende das tabelas: actual_lines, rateio_criteria, rateio_unit_weights,
-- driver_values, rateio_results, units.
-- ============================================================
CREATE OR REPLACE FUNCTION public.execute_rateio(p_year integer, p_month integer)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_src       RECORD;
  v_units     RECORD;
  v_total_w   NUMERIC;
  v_running   NUMERIC;
  v_alloc     NUMERIC;
  v_last_unit UUID;
  v_count     INT;
BEGIN
  DELETE FROM public.rateio_results WHERE year = p_year AND month = p_month;
  DELETE FROM public.actual_lines
    WHERE year = p_year AND month = p_month AND origin = 'RATEADO_ADM';

  FOR v_src IN
    SELECT al.*, rc.id AS criteria_id, rc.driver
    FROM public.actual_lines al
    JOIN public.rateio_criteria rc
      ON (rc.supplier_id = al.supplier_id OR rc.supplier_id IS NULL)
     AND (rc.category_id = al.category_id OR rc.category_id IS NULL)
     AND rc.is_active = true
     AND (rc.valid_to IS NULL OR rc.valid_to >= MAKE_DATE(p_year, p_month, 1))
    WHERE al.year = p_year AND al.month = p_month AND al.origin = 'RATEADO_ORIGEM'
  LOOP
    v_total_w := 0; v_running := 0; v_last_unit := NULL; v_count := 0;

    IF v_src.driver = 'IGUAL' THEN
      SELECT COUNT(*) INTO v_count FROM public.units WHERE type = 'OP' AND is_active = true;
      IF v_count = 0 THEN CONTINUE; END IF;

      FOR v_units IN SELECT id FROM public.units WHERE type = 'OP' AND is_active = true LOOP
        v_alloc := ROUND(v_src.value / v_count, 2);
        v_running := v_running + v_alloc;
        v_last_unit := v_units.id;
        INSERT INTO public.rateio_results(criteria_id, source_line_id, unit_id, year, month, allocated, weight_pct)
        VALUES(v_src.criteria_id, v_src.id, v_units.id, p_year, p_month, v_alloc, ROUND(100.0/v_count, 4));
      END LOOP;

    ELSE
      SELECT SUM(
        CASE WHEN v_src.driver IN ('FIXO_UNIT','MANUAL') THEN COALESCE(w.weight, 0)
             ELSE COALESCE(dv.value, 0)
        END
      ) INTO v_total_w
      FROM public.units u
      LEFT JOIN public.rateio_unit_weights w ON w.criteria_id = v_src.criteria_id AND w.unit_id = u.id
      LEFT JOIN public.driver_values dv ON dv.unit_id = u.id AND dv.driver = v_src.driver AND dv.year = p_year AND dv.month = p_month
      WHERE u.type = 'OP' AND u.is_active = true;

      IF COALESCE(v_total_w, 0) = 0 THEN CONTINUE; END IF;

      FOR v_units IN
        SELECT u.id,
          CASE WHEN v_src.driver IN ('FIXO_UNIT','MANUAL') THEN COALESCE(w.weight, 0)
               ELSE COALESCE(dv.value, 0)
          END AS w
        FROM public.units u
        LEFT JOIN public.rateio_unit_weights w ON w.criteria_id = v_src.criteria_id AND w.unit_id = u.id
        LEFT JOIN public.driver_values dv ON dv.unit_id = u.id AND dv.driver = v_src.driver AND dv.year = p_year AND dv.month = p_month
        WHERE u.type = 'OP' AND u.is_active = true
          AND COALESCE(
            CASE WHEN v_src.driver IN ('FIXO_UNIT','MANUAL') THEN w.weight ELSE dv.value END, 0
          ) > 0
      LOOP
        v_alloc := ROUND(v_src.value * v_units.w / v_total_w, 2);
        v_running := v_running + v_alloc;
        v_last_unit := v_units.id;
        INSERT INTO public.rateio_results(criteria_id, source_line_id, unit_id, year, month, allocated, weight_pct)
        VALUES(v_src.criteria_id, v_src.id, v_units.id, p_year, p_month, v_alloc, ROUND(v_units.w / v_total_w * 100, 4));
      END LOOP;
    END IF;

    -- ajuste de centavo no último item
    IF v_last_unit IS NOT NULL AND v_running <> v_src.value THEN
      UPDATE public.rateio_results
        SET allocated = allocated + (v_src.value - v_running)
      WHERE source_line_id = v_src.id AND unit_id = v_last_unit;
    END IF;

    INSERT INTO public.actual_lines(unit_id, category_id, supplier_id, year, month, value, origin, source, note)
    SELECT unit_id, v_src.category_id, v_src.supplier_id, p_year, p_month, allocated,
           'RATEADO_ADM', 'rateio', 'Rateio executado via execute_rateio()'
    FROM public.rateio_results
    WHERE source_line_id = v_src.id;

  END LOOP;
END;
$function$;
