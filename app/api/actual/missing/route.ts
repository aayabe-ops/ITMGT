import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import pool from '@/lib/db'

// Fornecedores com BUDGET no ano/escopo mas SEM lançamento (realizado) no mês.
// Retorna também a unidade/categoria padrão (a de maior budget) para lançar direto na tabela.
export async function GET(req: NextRequest) {
  const user = getCurrentUser(); if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const sp = req.nextUrl.searchParams
  const year = parseInt(sp.get('year') || String(new Date().getFullYear()))
  const month = parseInt(sp.get('month') || String(new Date().getMonth() + 1))

  let unitId = sp.get('unit_id') || null
  const unidadeId = sp.get('unidade_id') || null
  let countryId = sp.get('country_id') || null
  let platformId = sp.get('platform_id') || null
  let countryIds: string[] | null = null
  if (user.role !== 'admin' && user.role !== 'lancador' && user.role !== 'analista' && user.role !== 'gerente') {
    const { rows: [sc] } = await pool.query('SELECT platform_id, country_id, unit_id FROM public.users WHERE id=$1', [user.id])
    const mc = (await pool.query('SELECT country_id FROM public.user_countries WHERE user_id=$1', [user.id])).rows.map((r: any) => r.country_id)
    if (mc.length) { countryIds = mc; unitId = null; countryId = null; platformId = null }
    else if (sc?.unit_id) { unitId = sc.unit_id; countryId = null; platformId = null }
    else if (sc?.country_id) { countryId = sc.country_id; platformId = null }
    else if (sc?.platform_id) { platformId = sc.platform_id }
    else return NextResponse.json([])
  }

  const params: any[] = [year, month]
  const scope = (col: string) => {
    const c: string[] = []
    if (unitId) { params.push(unitId); c.push(`${col} = $${params.length}`) }
    if (unidadeId) { params.push(unidadeId); c.push(`${col} IN (SELECT id FROM public.units WHERE unidade_id = $${params.length})`) }
    if (countryId) { params.push(countryId); c.push(`${col} IN (SELECT id FROM public.units WHERE country_id = $${params.length})`) }
    if (countryIds) { params.push(countryIds); c.push(`${col} IN (SELECT id FROM public.units WHERE country_id = ANY($${params.length}::uuid[]))`) }
    if (platformId) { params.push(platformId); c.push(`${col} IN (SELECT u.id FROM public.units u JOIN public.countries co ON co.id=u.country_id WHERE co.platform_id = $${params.length})`) }
    return c.length ? ' AND ' + c.join(' AND ') : ''
  }
  const condB = scope('bl.unit_id')  // empurra params de budget primeiro (usados na CTE)
  const condA = scope('al.unit_id')  // depois os de actual (NOT EXISTS)

  // Um "serviço" = fornecedor + CATEGORIA. O mesmo fornecedor pode ter vários serviços,
  // cada um com sua própria regra de rateio (ou direto). Listamos UM pendente por serviço.
  // has_rule = existe regra ativa/vigente casando este fornecedor+categoria → modo RATEIO
  // é decidido POR SERVIÇO (não pelo flag do fornecedor).
  const { rows } = await pool.query(`
    WITH bl AS (
      SELECT bl.supplier_id, bl.category_id, bl.unit_id, SUM(bl.value) AS v
      FROM public.budget_lines bl
      WHERE bl.year = $1 AND bl.is_active = true AND bl.supplier_id IS NOT NULL ${condB}
      GROUP BY bl.supplier_id, bl.category_id, bl.unit_id
    ),
    svc AS (
      SELECT DISTINCT ON (supplier_id, category_id)
             supplier_id, category_id,
             unit_id AS anchor_unit,
             SUM(v) OVER (PARTITION BY supplier_id, category_id) AS cat_total
      FROM bl
      ORDER BY supplier_id, category_id, v DESC
    )
    SELECT s.id,
           (s.id::text || '|' || COALESCE(svc.category_id::text, '')) AS key,
           COALESCE(s.short_name, s.name)         AS name,
           COALESCE(ct.expense_mode, 'DIRETO')    AS expense_mode,  -- padrão/dica do SERVIÇO; o modo real é has_rule
           svc.category_id                        AS category_id,   -- a categoria define o serviço
           c.name                                 AS category_name,
           COALESCE(ct.unit_id, svc.anchor_unit)  AS unit_id,       -- DIRETO: CC do serviço › budget. RATEIO: âncora p/ origem
           COALESCE(ct.cost_class::text, c.cost_class::text) AS cost_class,  -- tratamento do serviço › categoria
           svc.cat_total                          AS budget_ano,
           EXISTS (
             SELECT 1 FROM public.rateio_criteria rc
             WHERE rc.status = 'ACTIVE' AND rc.apply_actual = true AND rc.source_origin = 'INICIAL'
               AND rc.valid_from <= make_date($1,$2,1)
               AND (rc.valid_to IS NULL OR rc.valid_to >= make_date($1,$2,1))
               AND (rc.supplier_id = s.id OR rc.supplier_id IS NULL)
               AND (rc.category_id = svc.category_id OR rc.category_id IS NULL)
           )                                      AS has_rule
    FROM svc
    JOIN public.suppliers s ON s.id = svc.supplier_id AND s.is_active = true
    LEFT JOIN public.categories c ON c.id = svc.category_id
    LEFT JOIN LATERAL (
      SELECT ct.expense_mode, ct.unit_id, ct.cost_class
      FROM public.contracts ct
      WHERE ct.is_active = true AND ct.supplier_id = svc.supplier_id
        AND ct.category_id IS NOT DISTINCT FROM svc.category_id
      ORDER BY (ct.unit_id IS NOT NULL) DESC, ct.created_at DESC
      LIMIT 1
    ) ct ON true
    WHERE NOT EXISTS (
      SELECT 1 FROM public.actual_lines al
      WHERE al.supplier_id = s.id AND al.year = $1 AND al.month = $2
        AND al.category_id IS NOT DISTINCT FROM svc.category_id ${condA})
    ORDER BY name, category_name`, params)
  return NextResponse.json(rows)
}
