import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import pool from '@/lib/db'

// Painel executivo (F5): Budget FY, Actual YTD, Forecast FY (= Actual até o último mês
// com realizado + Budget dos meses seguintes), OPEX/CAPEX, Committed (contratos) e Available.
// Escopo: plataforma/país/unidade (admin livre; não-admin conforme users).
export async function GET(req: NextRequest) {
  const u = getCurrentUser(); if (!u) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const sp = req.nextUrl.searchParams
  const year = parseInt(sp.get('year') || String(new Date().getFullYear()))
  const usd = sp.get('usd') === '1'

  let unitId = sp.get('unit_id') || null
  const unidadeId = sp.get('unidade_id') || null
  let countryId = sp.get('country_id') || null
  let platformId = sp.get('platform_id') || null
  let countryIds: string[] | null = null
  if (u.role !== 'admin') {
    const { rows: [sc] } = await pool.query('SELECT platform_id, country_id, unit_id FROM public.users WHERE id=$1', [u.id])
    const mc = (await pool.query('SELECT country_id FROM public.user_countries WHERE user_id=$1', [u.id])).rows.map((r: any) => r.country_id)
    if (mc.length) { countryIds = mc; unitId = null; countryId = null; platformId = null }
    else if (sc?.unit_id) { unitId = sc.unit_id; countryId = null; platformId = null }
    else if (sc?.country_id) { countryId = sc.country_id; platformId = null }
    else if (sc?.platform_id) { platformId = sc.platform_id }
    else return NextResponse.json({ empty: true })
  }

  const params: any[] = [year]
  let ci = 0, ui = 0, pi = 0, di = 0, cmi = 0
  if (countryId) { params.push(countryId); ci = params.length }
  if (countryIds) { params.push(countryIds); cmi = params.length }
  if (unitId) { params.push(unitId); ui = params.length }
  if (platformId) { params.push(platformId); pi = params.length }
  if (unidadeId) { params.push(unidadeId); di = params.length }
  const scope = (unitCol: string) => {
    const c: string[] = []
    if (ci) c.push(`u.country_id = $${ci}`)
    if (cmi) c.push(`u.country_id = ANY($${cmi}::uuid[])`)
    if (ui) c.push(`${unitCol} = $${ui}`)
    if (di) c.push(`${unitCol} IN (SELECT id FROM public.units WHERE unidade_id = $${di})`)
    if (pi) c.push(`u.country_id IN (SELECT id FROM public.countries WHERE platform_id = $${pi})`)
    return c.length ? ' AND ' + c.join(' AND ') : ''
  }
  const conv = (col: string) => usd ? `${col} / COALESCE(er.usd_rate, 1)` : col

  const sql = `
    WITH bl AS (
      SELECT b.month,
             COALESCE(b.cost_class, svc.cost_class::text, cat.cost_class) AS cost_class,
             (${conv('b.value')})::float AS val
      FROM public.budget_lines b
      JOIN public.units u ON u.id = b.unit_id
      LEFT JOIN public.contracts svc ON svc.id = b.service_id
      LEFT JOIN public.categories cat ON cat.id = b.category_id
      LEFT JOIN public.exchange_rates er ON er.country_id = u.country_id AND er.year = b.year AND er.month = 0
      WHERE b.year = $1 AND b.is_active = true ${scope('b.unit_id')}
    ),
    al AS (
      SELECT al.month, (${conv('al.value')})::float AS val
      FROM public.actual_lines al
      JOIN public.units u ON u.id = al.unit_id
      LEFT JOIN public.exchange_rates er ON er.country_id = u.country_id AND er.year = al.year AND er.month = 0
      WHERE al.year = $1 AND (al.origin::text <> 'RATEADO_ORIGEM') ${scope('al.unit_id')}
    ),
    la AS (SELECT COALESCE(MAX(month),0) AS m FROM al WHERE val <> 0),
    cm AS (
      SELECT (${conv('vcm.committed_value')})::float AS val
      FROM public.vw_contract_monthly vcm
      JOIN public.units u ON u.id = vcm.unit_id
      LEFT JOIN public.exchange_rates er ON er.country_id = u.country_id AND er.year = vcm.year AND er.month = 0
      WHERE vcm.year = $1 ${scope('vcm.unit_id')}
    )
    SELECT json_build_object(
      'lastActualMonth', (SELECT m FROM la),
      'budgetFY',   (SELECT COALESCE(SUM(val),0) FROM bl),
      'actualYTD',  (SELECT COALESCE(SUM(val),0) FROM al WHERE month <= (SELECT m FROM la)),
      'forecastFY', (SELECT COALESCE(SUM(val),0) FROM al WHERE month <= (SELECT m FROM la))
                  + (SELECT COALESCE(SUM(val),0) FROM bl WHERE month >  (SELECT m FROM la)),
      'opex',   (SELECT COALESCE(SUM(val),0) FROM bl WHERE cost_class = 'OPEX'),
      'capex',  (SELECT COALESCE(SUM(val),0) FROM bl WHERE cost_class = 'CAPEX'),
      'committed', (SELECT COALESCE(SUM(val),0) FROM cm)
    ) AS data`
  try {
    const { rows } = await pool.query(sql, params)
    const d = rows[0].data
    d.varianceFY = d.forecastFY - d.budgetFY
    d.available = d.budgetFY - d.committed
    return NextResponse.json(d)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erro no painel executivo' }, { status: 200 })
  }
}
