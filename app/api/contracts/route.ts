import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser, canManageSupply } from '@/lib/auth'
import pool from '@/lib/db'

const noauth = () => NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

const FIELDS = ['code', 'name', 'supplier_id', 'unit_id', 'category_id', 'cost_center_id', 'currency_id',
  'cost_class', 'total_value', 'monthly_value', 'periodicity', 'start_date', 'end_date',
  'readjust_index', 'readjust_month', 'notes', 'is_active'] as const

export async function GET() {
  const u = getCurrentUser(); if (!u) return noauth()
  const { rows } = await pool.query(`
    SELECT ct.id, ct.code, ct.name, ct.supplier_id, ct.unit_id, ct.category_id, ct.cost_center_id, ct.currency_id,
           ct.cost_class::text AS cost_class, ct.total_value, ct.monthly_value, ct.periodicity,
           to_char(ct.start_date,'YYYY-MM-DD') AS start_date,
           to_char(ct.end_date,'YYYY-MM-DD')   AS end_date,
           ct.readjust_index, ct.readjust_month, ct.notes, ct.is_active,
           COALESCE(s.short_name, s.name) AS supplier_name, un.code AS unit_code,
           c.name AS category_name, cc.name AS cost_center_name, cur.code AS currency_code
    FROM public.contracts ct
    LEFT JOIN public.suppliers    s   ON s.id  = ct.supplier_id
    LEFT JOIN public.units        un  ON un.id = ct.unit_id
    LEFT JOIN public.categories   c   ON c.id  = ct.category_id
    LEFT JOIN public.cost_centers cc  ON cc.id = ct.cost_center_id
    LEFT JOIN public.currencies   cur ON cur.id = ct.currency_id
    ORDER BY ct.name`)
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const u = getCurrentUser(); if (!canManageSupply(u)) return noauth()
  const b: any = await req.json().catch(() => null)
  if (!b?.name?.trim()) return NextResponse.json({ error: 'Nome é obrigatório.' }, { status: 400 })
  const cols: string[] = [], ph: string[] = [], vals: any[] = []
  let i = 1
  for (const f of FIELDS) if (f in b && b[f] !== undefined) { cols.push(f); ph.push(`$${i++}`); vals.push(b[f] === '' ? null : b[f]) }
  try {
    const { rows } = await pool.query(`INSERT INTO public.contracts(${cols.join(',')}) VALUES(${ph.join(',')}) RETURNING id`, vals)
    return NextResponse.json(rows[0])
  } catch (e: any) { return NextResponse.json({ error: e?.message || 'Erro ao inserir.' }, { status: 400 }) }
}

export async function PATCH(req: NextRequest) {
  const u = getCurrentUser(); if (!canManageSupply(u)) return noauth()
  const b: any = await req.json().catch(() => null)
  if (!b?.id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })
  const sets: string[] = [], vals: any[] = []
  let i = 1
  for (const f of FIELDS) if (f in b) { sets.push(`${f}=$${i++}`); vals.push(b[f] === '' ? null : b[f]) }
  vals.push(b.id)
  try {
    if (sets.length) await pool.query(`UPDATE public.contracts SET ${sets.join(',')} WHERE id=$${i}`, vals)
    return NextResponse.json({ ok: true })
  } catch (e: any) { return NextResponse.json({ error: e?.message || 'Erro ao atualizar.' }, { status: 400 }) }
}

export async function DELETE(req: NextRequest) {
  const u = getCurrentUser(); if (!canManageSupply(u)) return noauth()
  const b: any = await req.json().catch(() => null)
  if (!b?.id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })
  try {
    await pool.query('DELETE FROM public.contracts WHERE id=$1', [b.id])
    return NextResponse.json({ ok: true })
  } catch { return NextResponse.json({ error: 'Erro ao excluir.' }, { status: 400 }) }
}
