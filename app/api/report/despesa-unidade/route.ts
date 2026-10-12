import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser, canSeeReports } from '@/lib/auth'
import pool from '@/lib/db'

// Despesa por Unidade (showback): orçado, realizado direto e rateado por unidade.
// ?year= (obrigatório) &month= (opcional: YTD até o mês; vazio = ano inteiro)
export async function GET(req: NextRequest) {
  const u = getCurrentUser(); if (!canSeeReports(u)) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const sp = req.nextUrl.searchParams
  const year = parseInt(sp.get('year') || '') || new Date().getFullYear()
  const month = parseInt(sp.get('month') || '') || 0   // 0 = ano inteiro
  const usd = sp.get('usd') === '1'
  const mClause = month > 0 ? 'AND x.month <= $2' : ''
  const params: any[] = month > 0 ? [year, month] : [year]

  // valores em moeda local; USD = valor / taxa anual (month=0) do país da unidade
  const v = usd ? '(x.value / COALESCE(er.usd_rate, 1))' : 'x.value'
  const erJoin = `LEFT JOIN public.exchange_rates er ON er.country_id = u.country_id AND er.year = $1 AND er.month = 0`

  const sql = `
    SELECT ud.id, ud.code, ud.name,
           COALESCE(bud.v, 0)::float AS orcado,
           COALESCE(dir.v, 0)::float AS realizado_direto,
           COALESCE(rat.v, 0)::float AS rateado
      FROM public.unidades ud
      LEFT JOIN (
        SELECT u.unidade_id, SUM(${v}) v
          FROM public.budget_lines x JOIN public.units u ON u.id = x.unit_id ${erJoin}
         WHERE x.year = $1 AND x.is_active = true ${mClause}
         GROUP BY u.unidade_id) bud ON bud.unidade_id = ud.id
      LEFT JOIN (
        SELECT u.unidade_id, SUM(${v}) v
          FROM public.actual_lines x JOIN public.units u ON u.id = x.unit_id ${erJoin}
         WHERE x.year = $1 AND x.origin::text NOT IN ('RATEADO_ORIGEM','RATEADO_ADM') ${mClause}
         GROUP BY u.unidade_id) dir ON dir.unidade_id = ud.id
      LEFT JOIN (
        SELECT u.unidade_id, SUM(${v}) v
          FROM public.actual_lines x JOIN public.units u ON u.id = x.unit_id ${erJoin}
         WHERE x.year = $1 AND x.origin::text = 'RATEADO_ADM' ${mClause}
         GROUP BY u.unidade_id) rat ON rat.unidade_id = ud.id
     WHERE ud.is_active = true
     ORDER BY (COALESCE(bud.v,0) + COALESCE(dir.v,0) + COALESCE(rat.v,0)) DESC`
  try {
    const { rows } = await pool.query(sql, params)
    return NextResponse.json({ year, month, currency: usd ? 'USD' : 'BRL', rows })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erro ao gerar relatório.' }, { status: 200 })
  }
}
