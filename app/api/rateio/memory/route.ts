import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import pool from '@/lib/db'

// F08 — memória de cálculo do rateio (auditoria) por período.
export async function GET(req: NextRequest) {
  const user = getCurrentUser(); if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const sp = req.nextUrl.searchParams
  const year = parseInt(sp.get('year') || '0'), month = parseInt(sp.get('month') || '0')
  const scenario = sp.get('scenario') === 'BUDGET' ? 'BUDGET' : 'ACTUAL'
  if (!year || !month) return NextResponse.json([])
  const { rows } = await pool.query(
    `SELECT rr.id, rr.scenario, rr.criteria_version, rr.driver_code,
            rr.cost_total, rr.driver_total, rr.driver_unit_value, rr.weight_pct, rr.allocated, rr.created_at,
            u.code AS unit_code, COALESCE(ud.name, u.name) AS unit_name,
            COALESCE(s.short_name, s.name) AS supplier_name, c.name AS category_name,
            ad.unit_label AS driver_unit, ad.metric AS driver_metric
       FROM public.rateio_results rr
       JOIN public.units u             ON u.id = rr.unit_id
       LEFT JOIN public.unidades ud    ON ud.id = u.unidade_id
       LEFT JOIN public.rateio_criteria rc ON rc.id = rr.criteria_id
       LEFT JOIN public.allocation_drivers ad ON ad.code = rr.driver_code
       LEFT JOIN public.suppliers s    ON s.id = rc.supplier_id
       LEFT JOIN public.categories c   ON c.id = rc.category_id
      WHERE rr.year=$1 AND rr.month=$2 AND rr.scenario=$3
      ORDER BY supplier_name, u.code`,
    [year, month, scenario])
  return NextResponse.json(rows)
}
