import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import pool from '@/lib/db'

const noauth = () => NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
const FIELDS = ['supplier_id', 'unidade_id', 'unit_id', 'cost_class', 'value', 'year', 'month', 'notes', 'is_active'] as const

export async function GET() {
  const u = getCurrentUser(); if (!u) return noauth()
  const { rows } = await pool.query(`
    SELECT d.id, d.seq, 'DSP-' || lpad(d.seq::text, 5, '0') AS code,
           d.supplier_id, d.unidade_id, d.unit_id, d.cost_class,
           d.value, d.year, d.month, d.notes, d.is_active,
           COALESCE(s.short_name, s.name) AS supplier_name,
           ud.code AS unidade_code, ud.name AS unidade_name,
           un.code AS unit_code, un.name AS unit_name
      FROM public.despesas d
      LEFT JOIN public.suppliers     s  ON s.id  = d.supplier_id
      LEFT JOIN public.unidades      ud ON ud.id = d.unidade_id
      LEFT JOIN public.units         un ON un.id = d.unit_id
     ORDER BY d.seq DESC`)
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const u = getCurrentUser(); if (!u || u.role !== 'admin') return noauth()
  const b: any = await req.json().catch(() => null)
  if (!b?.supplier_id) return NextResponse.json({ error: 'Fornecedor é obrigatório.' }, { status: 400 })
  const cols: string[] = [], ph: string[] = [], vals: any[] = []
  let i = 1
  for (const f of FIELDS) if (f in b && b[f] !== undefined) { cols.push(f); ph.push(`$${i++}`); vals.push(b[f] === '' ? null : b[f]) }
  try {
    const { rows } = await pool.query(
      `INSERT INTO public.despesas(${cols.join(',')}) VALUES(${ph.join(',')})
       RETURNING id, 'DSP-' || lpad(seq::text,5,'0') AS code`, vals)
    return NextResponse.json(rows[0])
  } catch (e: any) { return NextResponse.json({ error: e?.message || 'Erro ao inserir.' }, { status: 400 }) }
}

export async function PATCH(req: NextRequest) {
  const u = getCurrentUser(); if (!u || u.role !== 'admin') return noauth()
  const b: any = await req.json().catch(() => null)
  if (!b?.id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })
  const sets: string[] = [], vals: any[] = []
  let i = 1
  for (const f of FIELDS) if (f in b) { sets.push(`${f}=$${i++}`); vals.push(b[f] === '' ? null : b[f]) }
  vals.push(b.id)
  try {
    if (sets.length) await pool.query(`UPDATE public.despesas SET ${sets.join(',')} WHERE id=$${i}`, vals)
    return NextResponse.json({ ok: true })
  } catch (e: any) { return NextResponse.json({ error: e?.message || 'Erro ao atualizar.' }, { status: 400 }) }
}

export async function DELETE(req: NextRequest) {
  const u = getCurrentUser(); if (!u || u.role !== 'admin') return noauth()
  const b: any = await req.json().catch(() => null)
  if (!b?.id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })
  try {
    await pool.query('DELETE FROM public.despesas WHERE id=$1', [b.id])
    return NextResponse.json({ ok: true })
  } catch { return NextResponse.json({ error: 'Erro ao excluir.' }, { status: 400 }) }
}
