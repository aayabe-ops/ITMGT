import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import pool from '@/lib/db'

// Comprometido (F4) = expansão mensal dos contratos (vw_contract_monthly), consolidável em USD.
export async function GET(req: NextRequest) {
  const u = getCurrentUser(); if (!u) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const sp = req.nextUrl.searchParams
  const year = parseInt(sp.get('year') || String(new Date().getFullYear()))
  const usd = sp.get('usd') === '1'
  const through = parseInt(sp.get('through') || '0')

  const params: any[] = [year]
  const conds: string[] = ['vcm.year = $1']
  const add = (col: string, val: any) => { params.push(val); conds.push(`${col} = $${params.length}`) }
  if (sp.get('country_id')) add('u.country_id', sp.get('country_id'))
  if (sp.get('unit_id')) add('vcm.unit_id', sp.get('unit_id'))
  if (sp.get('category_id')) add('vcm.category_id', sp.get('category_id'))
  if (sp.get('supplier_id')) add('vcm.supplier_id', sp.get('supplier_id'))
  if (through >= 1 && through <= 12) { params.push(through); conds.push(`vcm.month <= $${params.length}`) }

  const val = usd ? 'vcm.committed_value / COALESCE(er.usd_rate, 1)' : 'vcm.committed_value'
  const sql = `
    WITH cm AS (
      SELECT vcm.supplier_id, vcm.cost_class::text AS cost_class, (${val})::float AS val
      FROM public.vw_contract_monthly vcm
      LEFT JOIN public.units u ON u.id = vcm.unit_id
      LEFT JOIN public.exchange_rates er ON er.country_id = u.country_id AND er.year = vcm.year AND er.month = 0
      WHERE ${conds.join(' AND ')}
    )
    SELECT json_build_object(
      'total', (SELECT COALESCE(SUM(val),0) FROM cm),
      'byCostClass', (SELECT COALESCE(json_agg(row_to_json(t)),'[]') FROM (
          SELECT COALESCE(cost_class,'—') AS cost_class, SUM(val) AS committed FROM cm GROUP BY cost_class HAVING SUM(val)<>0) t),
      'bySupplier', (SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.committed DESC),'[]') FROM (
          SELECT COALESCE(s.short_name, s.name, 'Sem fornecedor') AS name, SUM(cm.val) AS committed
          FROM cm LEFT JOIN public.suppliers s ON s.id = cm.supplier_id
          GROUP BY s.short_name, s.name HAVING SUM(cm.val)<>0) t)
    ) AS data`
  try {
    const { rows } = await pool.query(sql, params)
    return NextResponse.json(rows[0].data)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erro ao calcular comprometido', total: 0, bySupplier: [], byCostClass: [] }, { status: 200 })
  }
}
