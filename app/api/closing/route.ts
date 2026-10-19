import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser, canManageBudget } from '@/lib/auth'
import pool from '@/lib/db'
import { applyRateioActual } from '@/lib/rateioEngine'

// Fechamento (MVP): Budget × Realizado × Desvio no grão fino, por ano/mês/unidade.
export async function GET(req: NextRequest) {
  const user = getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()))
  const month = parseInt(searchParams.get('month') || String(new Date().getMonth() + 1))
  const unitId = searchParams.get('unit_id') || (user.role === 'unit_viewer' ? user.unit_id : null)

  const params: any[] = [year, month]
  let where = 'v.year = $1 AND v.month = $2'
  if (unitId) { params.push(unitId); where += ` AND v.unit_id = $${params.length}` }

  const { rows } = await pool.query(`
    SELECT v.unit_id, v.category_id, v.supplier_id, v.project_id,
           v.budgeted, v.actual, v.variance, v.variance_pct,
           u.code  AS unit_code,
           c.name  AS category_name,
           COALESCE(s.short_name, s.name) AS supplier_name,
           p.name  AS project_name,
           ct.cost_class::text AS cost_class,
           co.name AS country_name,
           pl.name AS platform_name,
           ud.code AS unidade_code, ud.name AS unidade_nome
    FROM public.vw_closing v
    LEFT JOIN public.units      u  ON u.id  = v.unit_id
    LEFT JOIN public.categories c  ON c.id  = v.category_id
    LEFT JOIN public.suppliers  s  ON s.id  = v.supplier_id
    LEFT JOIN public.projects   p  ON p.id  = v.project_id
    LEFT JOIN LATERAL (
      SELECT ct.cost_class FROM public.contracts ct
      WHERE ct.is_active=true AND ct.supplier_id = v.supplier_id
        AND ct.category_id IS NOT DISTINCT FROM v.category_id
      ORDER BY (ct.unit_id = v.unit_id) DESC NULLS LAST, ct.created_at DESC
      LIMIT 1) ct ON true
    LEFT JOIN public.countries  co ON co.id = u.country_id
    LEFT JOIN public.platforms  pl ON pl.id = co.platform_id
    LEFT JOIN public.unidades   ud ON ud.id = u.unidade_id
    WHERE ${where}
    ORDER BY u.code, c.name, COALESCE(s.short_name, s.name)
  `, params)

  return NextResponse.json(rows)
}

// POST { year, month, close:true|false } — Fechar o mês (reprocessa o rateio do realizado
// e TRAVA o período) ou Reabrir (destrava). O reprocesso roda ANTES da trava.
export async function POST(req: NextRequest) {
  const user = getCurrentUser(); if (!canManageBudget(user)) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const b: any = await req.json().catch(() => ({}))
  const year = parseInt(b.year), month = parseInt(b.month)
  if (!(year > 0) || !(month >= 1 && month <= 12)) return NextResponse.json({ error: 'Ano/mês inválidos.' }, { status: 400 })

  if (b.close) {
    // 1) reprocessa o rateio do realizado (pega edições de regra/base de última hora)
    const r = await applyRateioActual(year, month)
    // 2) trava o período (realizado) — nada recalcula depois
    await pool.query(
      `INSERT INTO public.closed_periods(year, month, scenario, closed_by)
       VALUES($1,$2,'ACTUAL',$3) ON CONFLICT (year, month, scenario) DO NOTHING`,
      [year, month, user.id])
    return NextResponse.json({ ok: true, closed: true, rateio: r })
  } else {
    await pool.query(
      `DELETE FROM public.closed_periods WHERE year=$1 AND month=$2 AND scenario IN ('ACTUAL','ALL')`,
      [year, month])
    return NextResponse.json({ ok: true, closed: false })
  }
}
