import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import pool from '@/lib/db'

// month ausente ou 0 => ANO INTEIRO (soma dos 12 meses, agregado por unidade+categoria)
// month 1..12 => mês específico
// Escopo: admin livre; demais restritos ao seu país/unidade cadastrados.
export async function GET(req: NextRequest) {
  const user = getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()))
  const month = parseInt(searchParams.get('month') || '0')
  const mode = searchParams.get('mode') || ''

  let unitId = searchParams.get('unit_id') || null
  const unidadeId = searchParams.get('unidade_id') || null
  let countryId = searchParams.get('country_id') || null
  let platformId = searchParams.get('platform_id') || null
  let countryIds: string[] | null = null

  // Imposição de escopo para não-admin: unidade > multi-país > país > plataforma > (sem escopo = nada).
  // Admin (ou usuário sem restrição) vê o acumulado de todas as plataformas.
  if (user.role !== 'admin' && user.role !== 'lancador') {
    const { rows: [sc] } = await pool.query('SELECT platform_id, country_id, unit_id FROM public.users WHERE id=$1', [user.id])
    const mc = (await pool.query('SELECT country_id FROM public.user_countries WHERE user_id=$1', [user.id])).rows.map((r: any) => r.country_id)
    if (mc.length) { countryIds = mc; unitId = null; countryId = null; platformId = null }
    else if (sc?.unit_id) { unitId = sc.unit_id; countryId = null; platformId = null }
    else if (sc?.country_id) { countryId = sc.country_id; platformId = null }
    else if (sc?.platform_id) { platformId = sc.platform_id } // pode filtrar país/unidade dentro da plataforma
    else return NextResponse.json([]) // sem escopo definido → nada
  }

  // usd=1 → normaliza cada linha para USD dividindo pela taxa anual (month=0) do país da unidade.
  // Necessário porque o budget agora é multi-moeda (BRL/UYU/PYG): somar valores nativos seria sem sentido.
  const usd = searchParams.get('usd') === '1'
  const from = usd
    ? `public.vw_budget_vs_actual v
         JOIN public.units u ON u.id = v.unit_id
         LEFT JOIN public.exchange_rates er ON er.country_id = u.country_id AND er.year = v.year AND er.month = 0`
    : `public.vw_budget_vs_actual v`
  const conv = usd ? ' / COALESCE(er.usd_rate, 1)' : ''

  const params: any[] = [year]
  const conds: string[] = ['v.year = $1']
  if (unitId) { params.push(unitId); conds.push(`v.unit_id = $${params.length}`) }
  if (unidadeId) { params.push(unidadeId); conds.push(`v.unit_id IN (SELECT id FROM public.units WHERE unidade_id = $${params.length})`) }
  if (countryId) { params.push(countryId); conds.push(`v.unit_id IN (SELECT id FROM public.units WHERE country_id = $${params.length})`) }
  if (countryIds) { params.push(countryIds); conds.push(`v.unit_id IN (SELECT id FROM public.units WHERE country_id = ANY($${params.length}::uuid[]))`) }
  if (platformId) { params.push(platformId); conds.push(`v.unit_id IN (SELECT u.id FROM public.units u JOIN public.countries c ON c.id = u.country_id WHERE c.platform_id = $${params.length})`) }

  // F1 — YTD: through=N soma os meses 1..N (acumulado até o mês N)
  const through = parseInt(searchParams.get('through') || '0')
  const ytd = through >= 1 && through <= 12
  if (ytd) { params.push(through); conds.push(`v.month <= $${params.length}`) }

  // Série mensal
  if (mode === 'monthly') {
    const q = `SELECT v.month, SUM(v.budgeted${conv}) AS budget, SUM(v.actual${conv}) AS actual
                 FROM ${from}
                WHERE ${conds.join(' AND ')}
                GROUP BY v.month ORDER BY v.month`
    const { rows } = await pool.query(q, params)
    return NextResponse.json(rows)
  }

  // Matriz por unidade+categoria+FORNECEDOR+mês (grão fino via vw_closing)
  if (mode === 'matrix') {
    const mfrom = usd
      ? `public.vw_closing v JOIN public.units u ON u.id = v.unit_id LEFT JOIN public.exchange_rates er ON er.country_id = u.country_id AND er.year = v.year AND er.month = 0`
      : `public.vw_closing v`
    const q = `SELECT v.unit_id, v.category_id, v.supplier_id, v.month,
                      SUM(v.budgeted${conv}) AS budget, SUM(v.actual${conv}) AS actual
                 FROM ${mfrom}
                WHERE ${conds.join(' AND ')}
                GROUP BY v.unit_id, v.category_id, v.supplier_id, v.month`
    const { rows } = await pool.query(q, params)
    return NextResponse.json(rows)
  }

  const singleMonth = !ytd && month >= 1 && month <= 12
  if (singleMonth) { params.push(month); conds.push(`v.month = $${params.length}`) }
  const where = conds.join(' AND ')

  const query = singleMonth
    ? `SELECT v.unit_id, v.category_id,
              v.budgeted${conv} AS budgeted,
              v.actual${conv}   AS actual,
              (v.actual - v.budgeted)${conv} AS variance,
              v.variance_pct
         FROM ${from}
        WHERE ${where}`
    : `SELECT v.unit_id, v.category_id,
              SUM(v.budgeted${conv}) AS budgeted,
              SUM(v.actual${conv})   AS actual,
              SUM((v.actual - v.budgeted)${conv}) AS variance,
              CASE WHEN SUM(v.budgeted${conv}) <> 0
                   THEN SUM((v.actual - v.budgeted)${conv}) / SUM(v.budgeted${conv}) * 100
                   ELSE NULL END AS variance_pct
         FROM ${from}
        WHERE ${where}
        GROUP BY v.unit_id, v.category_id`

  const { rows } = await pool.query(query, params)
  return NextResponse.json(rows)
}
