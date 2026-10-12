import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser, canSeeReports } from '@/lib/auth'
import pool from '@/lib/db'

// Correlação por SERVIÇO (fornecedor + categoria + unidade):
//   Contratado = contratos ativos vigentes no ano × 12 (run-rate anual, por monthly_value).
//   Orçado     = SUM(budget_lines) do ano.
//   Realizado  = SUM(actual_lines) do ano, EXCLUINDO RATEADO_ORIGEM (soma as linhas já distribuídas).
// Mesmo grão nas três pontas → o serviço do orçamento bate com o contrato e com o lançamento.
// ?year= (obrigatório) &usd=1 (opcional) &unit_id= &unidade_id= &country_id=
export async function GET(req: NextRequest) {
  const u = getCurrentUser(); if (!canSeeReports(u)) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const sp = req.nextUrl.searchParams
  const year = parseInt(sp.get('year') || '') || new Date().getFullYear()
  const usd = sp.get('usd') === '1'
  const rate = usd ? 'COALESCE(er.usd_rate, 1)' : '1'

  const params: any[] = [year]
  const conds: string[] = []
  const add = (sql: string, val: any) => { params.push(val); conds.push(sql.replace('$$', `$${params.length}`)) }
  const unitId = sp.get('unit_id'); if (unitId) add('u.id = $$', unitId)
  const unidadeId = sp.get('unidade_id'); if (unidadeId) add('u.unidade_id = $$', unidadeId)
  const countryId = sp.get('country_id'); if (countryId) add('u.country_id = $$', countryId)
  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : ''

  const sql = `
    WITH ctr AS (
      SELECT supplier_id, category_id, unit_id, SUM(monthly_value * 12) AS v
        FROM public.contracts
       WHERE is_active = true AND monthly_value IS NOT NULL
         AND (start_date IS NULL OR date_part('year', start_date) <= $1)
         AND (end_date   IS NULL OR date_part('year', end_date)   >= $1)
       GROUP BY supplier_id, category_id, unit_id ),
    bud AS (
      SELECT supplier_id, category_id, unit_id, SUM(value) AS v
        FROM public.budget_lines WHERE year = $1 AND is_active = true
       GROUP BY supplier_id, category_id, unit_id ),
    act AS (
      SELECT supplier_id, category_id, unit_id, SUM(value) AS v
        FROM public.actual_lines WHERE year = $1 AND origin::text <> 'RATEADO_ORIGEM'
       GROUP BY supplier_id, category_id, unit_id ),
    keys AS (
      SELECT supplier_id, category_id, unit_id FROM ctr
      UNION SELECT supplier_id, category_id, unit_id FROM bud
      UNION SELECT supplier_id, category_id, unit_id FROM act )
    SELECT u.id AS unit_id, u.code AS unit_code,
           ud.id AS unidade_id, ud.name AS unidade_nome,
           s.id AS supplier_id, COALESCE(s.short_name, s.name) AS supplier_name,
           c.id AS category_id, c.name AS category_name,
           (COALESCE(ctr.v,0) / ${rate})::float AS contratado,
           (COALESCE(bud.v,0) / ${rate})::float AS orcado,
           (COALESCE(act.v,0) / ${rate})::float AS realizado,
           EXISTS (
             SELECT 1 FROM public.rateio_criteria rc
             WHERE rc.status='ACTIVE' AND rc.apply_actual=true AND rc.source_origin='INICIAL'
               AND (rc.supplier_id = k.supplier_id OR rc.supplier_id IS NULL)
               AND (rc.category_id = k.category_id OR rc.category_id IS NULL)
           ) AS rateado
      FROM keys k
      JOIN public.units u ON u.id = k.unit_id
      LEFT JOIN public.unidades ud ON ud.id = u.unidade_id
      LEFT JOIN public.suppliers s ON s.id = k.supplier_id
      LEFT JOIN public.categories c ON c.id = k.category_id
      LEFT JOIN ctr ON ctr.supplier_id IS NOT DISTINCT FROM k.supplier_id AND ctr.category_id IS NOT DISTINCT FROM k.category_id AND ctr.unit_id = k.unit_id
      LEFT JOIN bud ON bud.supplier_id IS NOT DISTINCT FROM k.supplier_id AND bud.category_id IS NOT DISTINCT FROM k.category_id AND bud.unit_id = k.unit_id
      LEFT JOIN act ON act.supplier_id IS NOT DISTINCT FROM k.supplier_id AND act.category_id IS NOT DISTINCT FROM k.category_id AND act.unit_id = k.unit_id
      LEFT JOIN public.exchange_rates er ON er.country_id = u.country_id AND er.year = $1 AND er.month = 0
      ${where}
     ORDER BY supplier_name, category_name, unidade_nome`
  try {
    const { rows } = await pool.query(sql, params)
    return NextResponse.json({ year, currency: usd ? 'USD' : 'BRL', rows })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erro ao gerar correlação.' }, { status: 200 })
  }
}
