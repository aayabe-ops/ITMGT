import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import pool from '@/lib/db'

const noauth = () => NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

// Resumo do rateio por Centro de Custo / Unidade / Empresa (soma dos alocados).
// GET ?year=&month=(0=ano todo)&scenario=ACTUAL|BUDGET
export async function GET(req: NextRequest) {
  const user = getCurrentUser(); if (!user || user.role !== 'admin') return noauth()
  const sp = req.nextUrl.searchParams
  const year = parseInt(sp.get('year') || '0')
  const month = parseInt(sp.get('month') || '0')
  const scenario = sp.get('scenario') === 'BUDGET' ? 'BUDGET' : 'ACTUAL'
  if (!year) return NextResponse.json([])

  const params: any[] = [year, scenario]
  let mc = ''
  if (month > 0) { params.push(month); mc = `AND rr.month=$${params.length}` }

  const { rows } = await pool.query(`
    SELECT u.code AS unit_code, COALESCE(u.name, u.code) AS unit_name,
           ud.name AS unidade_name, COALESCE(pl.name, '—') AS empresa_name,
           SUM(rr.allocated)::float AS total
      FROM public.rateio_results rr
      JOIN public.units u          ON u.id = rr.unit_id
      LEFT JOIN public.unidades ud ON ud.id = u.unidade_id
      LEFT JOIN public.countries c ON c.id = u.country_id
      LEFT JOIN public.platforms pl ON pl.id = c.platform_id
     WHERE rr.year=$1 AND rr.scenario=$2 ${mc}
     GROUP BY u.code, u.name, ud.name, pl.name
     ORDER BY empresa_name, unit_code`, params)
  return NextResponse.json(rows)
}
