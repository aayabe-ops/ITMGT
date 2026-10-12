import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import pool from '@/lib/db'

// Resumo do mês no escopo: budget do mês, realizado do mês e budget dos fornecedores ainda sem lançamento.
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
    else return NextResponse.json({ budgetMonth: 0, actualMonth: 0, pendingBudget: 0 })
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
  const condB1 = scope('b.unit_id')   // budget do mês
  const condA1 = scope('al.unit_id')  // realizado do mês
  const condB2 = scope('b.unit_id')   // budget dos pendentes
  const condA2 = scope('al.unit_id')  // subquery NOT EXISTS dos pendentes

  const sql = `
    SELECT
      (SELECT COALESCE(SUM(b.value),0) FROM public.budget_lines b
        WHERE b.year=$1 AND b.month=$2 AND b.is_active=true ${condB1})::float AS "budgetMonth",
      (SELECT COALESCE(SUM(al.value),0) FROM public.actual_lines al
        WHERE al.year=$1 AND al.month=$2 AND al.origin::text <> 'RATEADO_ORIGEM' ${condA1})::float AS "actualMonth",
      (SELECT COALESCE(SUM(b.value),0) FROM public.budget_lines b
        WHERE b.year=$1 AND b.month=$2 AND b.is_active=true ${condB2}
          AND NOT EXISTS (SELECT 1 FROM public.actual_lines al WHERE al.supplier_id=b.supplier_id AND al.year=$1 AND al.month=$2 ${condA2}))::float AS "pendingBudget"`
  try {
    const { rows } = await pool.query(sql, params)
    return NextResponse.json(rows[0])
  } catch (e: any) {
    return NextResponse.json({ budgetMonth: 0, actualMonth: 0, pendingBudget: 0, error: e?.message }, { status: 200 })
  }
}
