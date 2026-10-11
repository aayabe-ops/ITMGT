import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import pool from '@/lib/db'

const noauth = () => NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

const FIELDS = ['name', 'short_name', 'supplier_type_id', 'category_id', 'expense_mode', 'unit_id', 'cost_class', 'project_id', 'ga_group_id', 'cost_center_id', 'solution_type_id', 'contract_start', 'contract_end', 'payment_due_date', 'is_active'] as const

async function syncCountries(supplierId: string, countryIds: any) {
  if (!Array.isArray(countryIds)) return
  await pool.query('DELETE FROM public.supplier_countries WHERE supplier_id=$1', [supplierId])
  for (const cid of countryIds) {
    if (cid) await pool.query('INSERT INTO public.supplier_countries(supplier_id, country_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [supplierId, cid])
  }
}

export async function GET() {
  const u = getCurrentUser(); if (!u) return noauth()
  const { rows } = await pool.query(`
    SELECT s.id, s.name, s.short_name, s.is_active, s.expense_mode, s.cost_class,
           s.supplier_type_id, s.category_id, s.unit_id, s.project_id, s.ga_group_id, s.cost_center_id, s.solution_type_id,
           gg.name AS ga_group_name, cc.name AS cost_center_name, sol.name AS solution_type_name,
           to_char(s.contract_start, 'YYYY-MM-DD')   AS contract_start,
           to_char(s.contract_end, 'YYYY-MM-DD')     AS contract_end,
           to_char(s.payment_due_date, 'YYYY-MM-DD') AS payment_due_date,
           st.name AS type_name, c.name AS category_name, u.code AS unit_code, p.name AS project_name,
           COALESCE(ARRAY(SELECT sc.country_id FROM public.supplier_countries sc WHERE sc.supplier_id = s.id), '{}') AS country_ids,
           COALESCE(ARRAY(SELECT co.code FROM public.supplier_countries sc JOIN public.countries co ON co.id = sc.country_id WHERE sc.supplier_id = s.id ORDER BY co.code), '{}') AS country_codes,
           COALESCE(ARRAY(SELECT co.name FROM public.supplier_countries sc JOIN public.countries co ON co.id = sc.country_id WHERE sc.supplier_id = s.id ORDER BY co.name), '{}') AS country_names
    FROM public.suppliers s
    LEFT JOIN public.supplier_types st ON st.id = s.supplier_type_id
    LEFT JOIN public.categories     c  ON c.id  = s.category_id
    LEFT JOIN public.units          u  ON u.id  = s.unit_id
    LEFT JOIN public.projects       p  ON p.id  = s.project_id
    LEFT JOIN public.ga_groups      gg ON gg.id = s.ga_group_id
    LEFT JOIN public.cost_centers   cc ON cc.id = s.cost_center_id
    LEFT JOIN public.solution_types sol ON sol.id = s.solution_type_id
    ORDER BY s.name`)
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const u = getCurrentUser(); if (!u || u.role !== 'admin') return noauth()
  const b: any = await req.json().catch(() => null)
  if (!b?.name?.trim()) return NextResponse.json({ error: 'Nome é obrigatório.' }, { status: 400 })
  const cols: string[] = [], ph: string[] = [], vals: any[] = []
  let i = 1
  for (const f of FIELDS) if (f in b && b[f] !== undefined) { cols.push(f); ph.push(`$${i++}`); vals.push(b[f] === '' ? null : b[f]) }
  try {
    const { rows } = await pool.query(`INSERT INTO public.suppliers(${cols.join(',')}) VALUES(${ph.join(',')}) RETURNING id`, vals)
    await syncCountries(rows[0].id, b.country_ids)
    return NextResponse.json(rows[0])
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erro ao inserir.' }, { status: 400 })
  }
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
    if (sets.length) await pool.query(`UPDATE public.suppliers SET ${sets.join(',')} WHERE id=$${i}`, vals)
    if ('country_ids' in b) await syncCountries(b.id, b.country_ids)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erro ao atualizar.' }, { status: 400 })
  }
}

export async function DELETE(req: NextRequest) {
  const u = getCurrentUser(); if (!u || u.role !== 'admin') return noauth()
  const b: any = await req.json().catch(() => null)
  if (!b?.id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })
  try {
    await pool.query(`DELETE FROM public.suppliers WHERE id=$1`, [b.id])
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    if (e?.code === '23503') {
      await pool.query(`UPDATE public.suppliers SET is_active=false WHERE id=$1`, [b.id])
      return NextResponse.json({ ok: true, deactivated: true })
    }
    return NextResponse.json({ error: 'Erro ao excluir.' }, { status: 400 })
  }
}
