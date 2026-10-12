import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser, canSeeReports } from '@/lib/auth'
import pool from '@/lib/db'

// Forecast FY (derivado) por unidade:
//   Forecast = Realizado dos meses já fechados/realizados + Budget dos meses em aberto.
//   cutoff = último mês FECHADO (closed_periods) do ano; se nenhum, último mês COM realizado.
// ?year= (obrigatório) &usd=1 (opcional)
export async function GET(req: NextRequest) {
  const u = getCurrentUser(); if (!canSeeReports(u)) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const sp = req.nextUrl.searchParams
  const year = parseInt(sp.get('year') || '') || new Date().getFullYear()
  const usd = sp.get('usd') === '1'
  const v = (col: string) => usd ? `(${col} / COALESCE(er.usd_rate, 1))` : col
  const erJoin = `LEFT JOIN public.exchange_rates er ON er.country_id = u.country_id AND er.year = $1 AND er.month = 0`

  const sql = `
    WITH cutoff AS (
      SELECT COALESCE(
        (SELECT max(month) FROM public.closed_periods WHERE year=$1 AND scenario IN ('ACTUAL','ALL')),
        (SELECT max(month) FROM public.actual_lines   WHERE year=$1 AND origin::text <> 'RATEADO_ORIGEM'),
        0) AS m )
    SELECT ud.id, ud.code, ud.name,
           COALESCE(bud.v, 0)::float       AS orcado_fy,
           COALESCE(real_ytd.v, 0)::float  AS realizado,
           COALESCE(bud_rest.v, 0)::float  AS budget_restante
      FROM public.unidades ud
      LEFT JOIN (
        SELECT u.unidade_id, SUM(${v('x.value')}) v
          FROM public.budget_lines x JOIN public.units u ON u.id = x.unit_id ${erJoin}
         WHERE x.year = $1 AND x.is_active = true
         GROUP BY u.unidade_id) bud ON bud.unidade_id = ud.id
      LEFT JOIN (
        SELECT u.unidade_id, SUM(${v('x.value')}) v
          FROM public.budget_lines x JOIN public.units u ON u.id = x.unit_id ${erJoin}
         WHERE x.year = $1 AND x.is_active = true AND x.month > (SELECT m FROM cutoff)
         GROUP BY u.unidade_id) bud_rest ON bud_rest.unidade_id = ud.id
      LEFT JOIN (
        SELECT u.unidade_id, SUM(${v('x.value')}) v
          FROM public.actual_lines x JOIN public.units u ON u.id = x.unit_id ${erJoin}
         WHERE x.year = $1 AND x.origin::text <> 'RATEADO_ORIGEM' AND x.month <= (SELECT m FROM cutoff)
         GROUP BY u.unidade_id) real_ytd ON real_ytd.unidade_id = ud.id
     WHERE ud.is_active = true
     ORDER BY ud.name`
  try {
    const { rows } = await pool.query(sql, [year])
    const { rows: [cut] } = await pool.query(
      `SELECT COALESCE((SELECT max(month) FROM public.closed_periods WHERE year=$1 AND scenario IN ('ACTUAL','ALL')),
                       (SELECT max(month) FROM public.actual_lines WHERE year=$1 AND origin::text <> 'RATEADO_ORIGEM'),0) AS m`, [year])
    return NextResponse.json({ year, cutoff: cut?.m ?? 0, currency: usd ? 'USD' : 'BRL', rows })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erro ao gerar forecast.' }, { status: 200 })
  }
}
