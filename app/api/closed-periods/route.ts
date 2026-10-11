import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import pool from '@/lib/db'

// F09 — períodos fechados (trava anti-recálculo do rateio).
export async function GET(req: NextRequest) {
  const user = getCurrentUser(); if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const year = parseInt(req.nextUrl.searchParams.get('year') || '0')
  const { rows } = await pool.query(
    `SELECT year, month, scenario, to_char(closed_at,'YYYY-MM-DD HH24:MI') AS closed_at
       FROM public.closed_periods ${year ? 'WHERE year=$1' : ''} ORDER BY year, month`,
    year ? [year] : [])
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const user = getCurrentUser(); if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const b: any = await req.json().catch(() => ({}))
  const year = parseInt(b.year), month = parseInt(b.month)
  const scenario = ['ALL', 'BUDGET', 'ACTUAL'].includes(b.scenario) ? b.scenario : 'ALL'
  if (!(year > 0) || !(month >= 1 && month <= 12)) return NextResponse.json({ error: 'Ano/mês inválidos.' }, { status: 400 })
  if (b.close) {
    await pool.query(
      `INSERT INTO public.closed_periods(year, month, scenario, closed_by)
       VALUES($1,$2,$3,$4) ON CONFLICT (year, month, scenario) DO NOTHING`,
      [year, month, scenario, user.id])
  } else {
    await pool.query(`DELETE FROM public.closed_periods WHERE year=$1 AND month=$2 AND scenario=$3`, [year, month, scenario])
  }
  return NextResponse.json({ ok: true })
}
