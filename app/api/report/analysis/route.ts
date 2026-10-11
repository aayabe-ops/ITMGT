import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import pool from '@/lib/db'

const noauth = () => NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
const v = (x: string | null) => (x && x.trim() !== '' ? x : null)

// GET: última análise salva para o período/escopo atual.
export async function GET(req: NextRequest) {
  const u = getCurrentUser(); if (!u) return noauth()
  const sp = req.nextUrl.searchParams
  const p = [
    v(sp.get('year')), v(sp.get('month')), v(sp.get('country_id')), v(sp.get('company_id')),
    v(sp.get('unit_id')), v(sp.get('category_id')), v(sp.get('supplier_id')), v(sp.get('cost_class')),
    v(sp.get('period_kind')) || (v(sp.get('month')) ? 'MONTH' : 'FY'),
  ]
  const { rows } = await pool.query(
    `SELECT analysis, to_char(created_at,'DD/MM/YYYY HH24:MI') AS created_at
       FROM public.report_analyses
      WHERE year IS NOT DISTINCT FROM $1::int AND month IS NOT DISTINCT FROM $2::int
        AND country_id IS NOT DISTINCT FROM $3::uuid AND company_id IS NOT DISTINCT FROM $4::uuid
        AND unit_id IS NOT DISTINCT FROM $5::uuid AND category_id IS NOT DISTINCT FROM $6::uuid
        AND supplier_id IS NOT DISTINCT FROM $7::uuid AND cost_class IS NOT DISTINCT FROM $8
        AND period_kind IS NOT DISTINCT FROM $9
      ORDER BY created_at DESC LIMIT 1`, p)
  return NextResponse.json(rows[0] || null)
}

// POST: grava a análise gerada.
export async function POST(req: NextRequest) {
  const u = getCurrentUser(); if (!u) return noauth()
  const b: any = await req.json().catch(() => null)
  if (!b?.analysis?.trim()) return NextResponse.json({ error: 'Sem análise.' }, { status: 400 })
  const val = (x: any) => (x === '' || x == null ? null : x)
  try {
    const period_kind = val(b.period_kind) || (val(b.month) ? 'MONTH' : 'FY')
    const { rows } = await pool.query(
      `INSERT INTO public.report_analyses(year,month,country_id,company_id,unit_id,category_id,supplier_id,cost_class,currency,analysis,created_by,period_kind)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING to_char(created_at,'DD/MM/YYYY HH24:MI') AS created_at`,
      [val(b.year), val(b.month), val(b.country_id), val(b.company_id), val(b.unit_id),
       val(b.category_id), val(b.supplier_id), val(b.cost_class), val(b.currency), b.analysis, u.id, period_kind])
    return NextResponse.json({ ok: true, created_at: rows[0].created_at })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erro ao salvar análise.' }, { status: 400 })
  }
}
