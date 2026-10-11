import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import pool from '@/lib/db'

// Comprometido / Disponível por unidade:
//   Comprometido = contratos ativos nos meses em ABERTO (month > cutoff), via vw_contract_monthly.
//   Disponível  = Orçado FY − Realizado − Comprometido.
//   cutoff = último mês fechado/realizado do ano (igual ao Forecast).
// ?year= (obrigatório) &usd=1 (opcional)
export async function GET(req: NextRequest) {
  const u = getCurrentUser(); if (!u || u.role !== 'admin') return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
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
           COALESCE(bud.v, 0)::float  AS orcado,
           COALESCE(rea.v, 0)::float  AS realizado,
           COALESCE(com.v, 0)::float  AS comprometido
      FROM public.unidades ud
      LEFT JOIN (
        SELECT u.unidade_id, SUM(${v('x.value')}) v
          FROM public.budget_lines x JOIN public.units u ON u.id = x.unit_id ${erJoin}
         WHERE x.year = $1 AND x.is_active = true
         GROUP BY u.unidade_id) bud ON bud.unidade_id = ud.id
      LEFT JOIN (
        SELECT u.unidade_id, SUM(${v('x.value')}) v
          FROM public.actual_lines x JOIN public.units u ON u.id = x.unit_id ${erJoin}
         WHERE x.year = $1 AND x.origin::text <> 'RATEADO_ORIGEM'
         GROUP BY u.unidade_id) rea ON rea.unidade_id = ud.id
      LEFT JOIN (
        SELECT u.unidade_id, SUM(${v('x.committed_value')}) v
          FROM public.vw_contract_monthly x JOIN public.units u ON u.id = x.unit_id ${erJoin}
         WHERE x.year = $1 AND x.month > (SELECT m FROM cutoff)
         GROUP BY u.unidade_id) com ON com.unidade_id = ud.id
     WHERE ud.is_active = true
     ORDER BY ud.name`
  try {
    const { rows } = await pool.query(sql, [year])
    const { rows: [cut] } = await pool.query(
      `SELECT COALESCE((SELECT max(month) FROM public.closed_periods WHERE year=$1 AND scenario IN ('ACTUAL','ALL')),
                       (SELECT max(month) FROM public.actual_lines WHERE year=$1 AND origin::text <> 'RATEADO_ORIGEM'),0) AS m`, [year])
    return NextResponse.json({ year, cutoff: cut?.m ?? 0, currency: usd ? 'USD' : 'BRL', rows })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erro ao gerar disponível.' }, { status: 200 })
  }
}
