import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import pool from '@/lib/db'

// Relatório multi-dimensional. Consolida em USD (usd=1) dividindo cada linha pela taxa
// anual (month=0) do país da unidade — necessário porque o budget é multi-moeda.
// Filtros: year, month?, country_id, company_id, unit_id, category_id, supplier_id.
export async function GET(req: NextRequest) {
  const user = getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const year = parseInt(sp.get('year') ?? String(new Date().getFullYear()))
  const usd = sp.get('usd') === '1'
  const month = sp.get('month') ? parseInt(sp.get('month')!) : null
  const through = parseInt(sp.get('through') || '0') // F1 — YTD: meses 1..through
  const ytd = through >= 1 && through <= 12

  let country_id = sp.get('country_id') || null
  let company_id = sp.get('company_id') || null
  let unit_id = sp.get('unit_id') || null
  let countryIds: string[] | null = null
  const unidade_id = sp.get('unidade_id') || null
  const category_id = sp.get('category_id') || null
  const supplier_id = sp.get('supplier_id') || null

  // Escopo para não-admin (Diretor = leitura global, sem imposição de escopo)
  if (user.role !== 'admin' && user.role !== 'diretor') {
    const { rows: [sc] } = await pool.query('SELECT country_id, unit_id FROM public.users WHERE id=$1', [user.id])
    const mc = (await pool.query('SELECT country_id FROM public.user_countries WHERE user_id=$1', [user.id])).rows.map((r: any) => r.country_id)
    if (mc.length) { countryIds = mc; unit_id = null; country_id = null; company_id = null }
    else if (sc?.unit_id) { unit_id = sc.unit_id; country_id = null; company_id = null }
    else if (sc?.country_id) { country_id = sc.country_id }
    else return NextResponse.json({ empty: true })
  }

  const params: any[] = [year]
  const extraB: string[] = []
  const extraA: string[] = []
  const add = (colB: string | null, colA: string | null, val: any) => {
    params.push(val); const i = params.length
    if (colB) extraB.push(`AND ${colB} = $${i}`)
    if (colA) extraA.push(`AND ${colA} = $${i}`)
  }
  if (country_id)  add('u.country_id', 'au.country_id', country_id)
  if (countryIds) { params.push(countryIds); const i = params.length; extraB.push(`AND u.country_id = ANY($${i}::uuid[])`); extraA.push(`AND au.country_id = ANY($${i}::uuid[])`) }
  if (company_id)  add('u.company_id', 'au.company_id', company_id)
  if (unit_id)     add('b.unit_id', 'al.unit_id', unit_id)
  if (unidade_id) { params.push(unidade_id); const i = params.length; extraB.push(`AND b.unit_id IN (SELECT id FROM public.units WHERE unidade_id = $${i})`); extraA.push(`AND al.unit_id IN (SELECT id FROM public.units WHERE unidade_id = $${i})`) }
  if (category_id) add('b.category_id', 'al.category_id', category_id)
  if (supplier_id) add('b.supplier_id', null, supplier_id)
  const cost_class = sp.get('cost_class') || null
  if (cost_class) { params.push(cost_class); const i = params.length; extraB.push(`AND COALESCE(b.cost_class, svc.cost_class::text) = $${i}`); extraA.push(`AND al.cost_class::text = $${i}`) }
  if (month)       add('b.month', 'al.month', month)
  else if (ytd)  { params.push(through); const i = params.length; extraB.push(`AND b.month <= $${i}`); extraA.push(`AND al.month <= $${i}`) }

  const B = extraB.join(' ')
  const A = extraA.join(' ')
  const vB = usd ? 'b.value / COALESCE(er.usd_rate, 1)' : 'b.value'
  const vA = usd ? 'al.value / COALESCE(er.usd_rate, 1)' : 'al.value'

  const sql = `
    WITH base AS (
      SELECT b.month, b.category_id, b.supplier_id, b.unit_id, u.country_id, u.company_id,
             COALESCE(b.cost_class, svc.cost_class::text) AS cost_class, cur.code AS currency_code, sol.name AS solution_type,
             (${vB})::float AS val
      FROM public.budget_lines b
      JOIN public.units u ON u.id = b.unit_id
      LEFT JOIN public.contracts svc ON svc.id = b.service_id
      LEFT JOIN public.solution_types sol ON sol.id = svc.solution_type_id
      LEFT JOIN public.currencies cur ON cur.id = b.currency_id
      LEFT JOIN public.exchange_rates er ON er.country_id = u.country_id AND er.year = b.year AND er.month = 0
      WHERE b.year = $1 AND b.is_active = true ${B}
    ),
    base_prev AS (
      SELECT b.category_id, b.supplier_id, u.country_id,
             COALESCE(b.cost_class, svc.cost_class::text) AS cost_class, (${vB})::float AS val
      FROM public.budget_lines b
      JOIN public.units u ON u.id = b.unit_id
      LEFT JOIN public.contracts svc ON svc.id = b.service_id
      LEFT JOIN public.exchange_rates er ON er.country_id = u.country_id AND er.year = b.year AND er.month = 0
      WHERE b.year = $1 - 1 AND b.is_active = true ${B}
    ),
    yseries AS (
      SELECT b.year AS yr, SUM((${vB}))::float AS budget
      FROM public.budget_lines b
      JOIN public.units u ON u.id = b.unit_id
      LEFT JOIN public.contracts svc ON svc.id = b.service_id
      LEFT JOIN public.exchange_rates er ON er.country_id = u.country_id AND er.year = b.year AND er.month = 0
      WHERE b.year BETWEEN $1 - 3 AND $1 AND b.is_active = true ${B}
      GROUP BY b.year
    ),
    abase AS (
      SELECT al.month, al.category_id, al.unit_id, au.country_id, au.company_id,
             (${vA})::float AS val
      FROM public.actual_lines al
      JOIN public.units au ON au.id = al.unit_id
      LEFT JOIN public.exchange_rates er ON er.country_id = au.country_id AND er.year = al.year AND er.month = 0
      WHERE al.year = $1 AND (al.origin::text IS DISTINCT FROM 'RATEADO_ORIGEM') ${A}
    )
    SELECT json_build_object(
      'byCategory', (
        SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.budget DESC), '[]')
        FROM (
          SELECT c.id, c.name,
                 COALESCE(bb.b,0) AS budget, COALESCE(aa.a,0) AS actual
          FROM public.categories c
          LEFT JOIN (SELECT category_id, SUM(val) b FROM base GROUP BY category_id) bb ON bb.category_id = c.id
          LEFT JOIN (SELECT category_id, SUM(val) a FROM abase GROUP BY category_id) aa ON aa.category_id = c.id
          WHERE COALESCE(bb.b,0) <> 0 OR COALESCE(aa.a,0) <> 0
        ) t
      ),
      'bySupplier', (
        SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.budget DESC), '[]')
        FROM (
          SELECT s.id, s.name, st.name AS type_name,
                 SUM(base.val) AS budget
          FROM base JOIN public.suppliers s ON s.id = base.supplier_id
          LEFT JOIN public.supplier_types st ON st.id = s.supplier_type_id
          GROUP BY s.id, s.name, st.name
          HAVING SUM(base.val) <> 0
        ) t
      ),
      'byUnit', (
        SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.budget DESC), '[]')
        FROM (
          SELECT ud.id, ud.code, ud.name,
                 COALESCE(SUM(bb.b),0) AS budget, COALESCE(SUM(aa.a),0) AS actual
          FROM public.unidades ud
          JOIN public.units u ON u.unidade_id = ud.id
          LEFT JOIN (SELECT unit_id, SUM(val) b FROM base  GROUP BY unit_id) bb ON bb.unit_id = u.id
          LEFT JOIN (SELECT unit_id, SUM(val) a FROM abase GROUP BY unit_id) aa ON aa.unit_id = u.id
          GROUP BY ud.id, ud.code, ud.name
          HAVING COALESCE(SUM(bb.b),0) <> 0 OR COALESCE(SUM(aa.a),0) <> 0
        ) t
      ),
      'byCountry', (
        SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.budget DESC), '[]')
        FROM (
          SELECT co.id, co.name, SUM(base.val) AS budget
          FROM base JOIN public.countries co ON co.id = base.country_id
          GROUP BY co.id, co.name HAVING SUM(base.val) <> 0
        ) t
      ),
      'byCostClass', (
        SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.budget DESC), '[]')
        FROM (
          SELECT COALESCE(cost_class,'—') AS cost_class, SUM(val) AS budget
          FROM base GROUP BY cost_class HAVING SUM(val) <> 0
        ) t
      ),
      'byCurrency', (
        SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.budget DESC), '[]')
        FROM (
          SELECT COALESCE(currency_code,'—') AS currency_code, SUM(val) AS budget
          FROM base GROUP BY currency_code HAVING SUM(val) <> 0
        ) t
      ),
      'bySolutionType', (
        SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.budget DESC), '[]')
        FROM (
          SELECT COALESCE(solution_type,'Não classificado') AS solution_type, SUM(val) AS budget
          FROM base GROUP BY solution_type HAVING SUM(val) <> 0
        ) t
      ),
      'byMonth', (
        SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.month), '[]')
        FROM (
          SELECT g AS month,
                 COALESCE((SELECT SUM(val) FROM base  WHERE base.month  = g),0) AS budget,
                 COALESCE((SELECT SUM(val) FROM abase WHERE abase.month = g),0) AS actual
          FROM generate_series(1,12) g
        ) t
      ),
      'prevByCategory', (
        SELECT COALESCE(json_agg(row_to_json(t)), '[]')
        FROM (
          SELECT c.id, c.name, COALESCE(SUM(bp.val),0) AS budget
          FROM public.categories c
          JOIN base_prev bp ON bp.category_id = c.id
          GROUP BY c.id, c.name
        ) t
      ),
      'prevBySupplier', (
        SELECT COALESCE(json_agg(row_to_json(t)), '[]')
        FROM (
          SELECT s.id, s.name, SUM(bp.val) AS budget
          FROM base_prev bp JOIN public.suppliers s ON s.id = bp.supplier_id
          GROUP BY s.id, s.name HAVING SUM(bp.val) <> 0
        ) t
      ),
      'prevByCountry', (
        SELECT COALESCE(json_agg(row_to_json(t)), '[]')
        FROM (
          SELECT co.id, co.name, SUM(bp.val) AS budget
          FROM base_prev bp JOIN public.countries co ON co.id = bp.country_id
          GROUP BY co.id, co.name HAVING SUM(bp.val) <> 0
        ) t
      ),
      'prevByCostClass', (
        SELECT COALESCE(json_agg(row_to_json(t)), '[]')
        FROM (
          SELECT COALESCE(cost_class,'—') AS cost_class, SUM(val) AS budget
          FROM base_prev GROUP BY cost_class HAVING SUM(val) <> 0
        ) t
      ),
      'budgetByYear', (
        SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.yr), '[]')
        FROM (SELECT yr, budget FROM yseries) t
      )
    ) AS data`

  try {
    const { rows } = await pool.query(sql, params)
    return NextResponse.json(rows[0].data)
  } catch (e: any) {
    console.error('report query error:', e?.message)
    return NextResponse.json({ error: e?.message || 'Erro na consulta do relatório' }, { status: 200 })
  }
}
