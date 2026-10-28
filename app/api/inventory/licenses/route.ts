import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser, canManageInventory } from '@/lib/auth'
import { writableUnidadeIds, checkUnidadesWritable, outOfScopeMsg } from '@/lib/scope'
import pool from '@/lib/db'

const noauth = () => NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
const FIELDS = ['asset_group_id', 'unidade_id', 'product', 'vendor', 'supplier_id', 'license_type',
  'metric', 'seats', 'seats_used', 'start_date', 'expiry_date', 'notes', 'is_active']

// GET: licenças no escopo do usuário. Licenças corporativas (unidade_id null) só aparecem
// para leitores globais (admin/diretor); usuários com escopo veem as das suas unidades.
export async function GET(req: NextRequest) {
  const user = getCurrentUser(); if (!user || !canManageInventory(user)) return noauth()
  const scope = await writableUnidadeIds(user)
  const params: any[] = []
  let where = 'l.is_active = true'
  if (scope) { params.push([...scope]); where += ` AND l.unidade_id = ANY($${params.length}::uuid[])` }
  const sp = req.nextUrl.searchParams
  const g = sp.get('group_id'); if (g) { params.push(g); where += ` AND l.asset_group_id = $${params.length}` }
  const un = sp.get('unidade_id'); if (un) { params.push(un); where += ` AND l.unidade_id = $${params.length}` }
  const { rows } = await pool.query(
    `SELECT l.id, l.asset_group_id, l.unidade_id, l.product, l.vendor, l.supplier_id, l.license_type,
            l.metric, l.seats, l.seats_used, l.start_date, l.expiry_date, l.notes, l.created_at,
            g.name AS group_name, g.code AS group_code,
            un.code AS unidade_code, un.name AS unidade_name
       FROM public.licenses l
       JOIN public.asset_groups g ON g.id = l.asset_group_id
       LEFT JOIN public.unidades un ON un.id = l.unidade_id
      WHERE ${where}
      ORDER BY l.expiry_date NULLS LAST, l.product`, params)
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const user = getCurrentUser(); if (!user || !canManageInventory(user)) return noauth()
  const b: any = await req.json().catch(() => null)
  if (!b?.asset_group_id || !b?.product) return NextResponse.json({ error: 'Grupo e produto são obrigatórios.' }, { status: 400 })
  const scope = await writableUnidadeIds(user)
  if (!b.unidade_id) {
    if (scope !== null) return NextResponse.json({ error: 'Selecione uma unidade do seu escopo (licença corporativa só por administrador global).' }, { status: 403 })
  } else {
    const chk = await checkUnidadesWritable(user, [b.unidade_id]); if (!chk.ok) return NextResponse.json({ error: outOfScopeMsg(chk.count) }, { status: 403 })
  }
  const fields = FIELDS.filter(f => f in b)
  const vals = fields.map(f => b[f] === '' ? null : b[f])
  fields.push('created_by', 'updated_by'); vals.push(user.id, user.id)
  const ph = fields.map((_, i) => `$${i + 1}`).join(',')
  try {
    const { rows } = await pool.query(`INSERT INTO public.licenses(${fields.join(',')}) VALUES(${ph}) RETURNING id`, vals)
    return NextResponse.json({ ok: true, id: rows[0].id })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erro ao inserir.' }, { status: 400 })
  }
}

export async function PATCH(req: NextRequest) {
  const user = getCurrentUser(); if (!user || !canManageInventory(user)) return noauth()
  const b: any = await req.json().catch(() => null)
  if (!b?.id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })
  const { rows: [cur] } = await pool.query('SELECT unidade_id FROM public.licenses WHERE id=$1', [b.id])
  if (!cur) return NextResponse.json({ error: 'Licença não encontrada.' }, { status: 404 })
  const toCheck = [cur.unidade_id, ...(b.unidade_id ? [b.unidade_id] : [])].filter(Boolean)
  if (toCheck.length) { const chk = await checkUnidadesWritable(user, toCheck); if (!chk.ok) return NextResponse.json({ error: outOfScopeMsg(chk.count) }, { status: 403 }) }
  const sets: string[] = [], vals: any[] = []
  let i = 1
  for (const f of FIELDS) if (f in b) { sets.push(`${f}=$${i++}`); vals.push(b[f] === '' ? null : b[f]) }
  sets.push(`updated_by=$${i++}`); vals.push(user.id)
  sets.push(`updated_at=now()`)
  vals.push(b.id)
  try {
    await pool.query(`UPDATE public.licenses SET ${sets.join(',')} WHERE id=$${i}`, vals)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erro ao atualizar.' }, { status: 400 })
  }
}

export async function DELETE(req: NextRequest) {
  const user = getCurrentUser(); if (!user || !canManageInventory(user)) return noauth()
  const b: any = await req.json().catch(() => null)
  if (!b?.id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })
  const { rows: [cur] } = await pool.query('SELECT unidade_id FROM public.licenses WHERE id=$1', [b.id])
  if (!cur) return NextResponse.json({ ok: true })
  if (cur.unidade_id) { const chk = await checkUnidadesWritable(user, [cur.unidade_id]); if (!chk.ok) return NextResponse.json({ error: outOfScopeMsg(chk.count) }, { status: 403 }) }
  await pool.query('DELETE FROM public.licenses WHERE id=$1', [b.id])
  return NextResponse.json({ ok: true })
}
