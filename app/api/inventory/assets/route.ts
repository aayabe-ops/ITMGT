import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser, canManageInventory } from '@/lib/auth'
import { writableUnidadeIds, checkUnidadesWritable, outOfScopeMsg } from '@/lib/scope'
import pool from '@/lib/db'

const noauth = () => NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
// Campos graváveis (whitelist). created_by/updated_by são controlados pelo servidor.
const FIELDS = ['asset_group_id', 'unidade_id', 'name', 'subtype', 'manufacturer', 'model',
  'serial_number', 'asset_tag', 'os', 'status', 'notes', 'is_active']

// GET: lista os ativos no escopo do usuário (admin/diretor = todos).
export async function GET(req: NextRequest) {
  const user = getCurrentUser(); if (!user || !canManageInventory(user)) return noauth()
  const scope = await writableUnidadeIds(user)
  const params: any[] = []
  let where = 'a.is_active = true'
  if (scope) { params.push([...scope]); where += ` AND a.unidade_id = ANY($${params.length}::uuid[])` }
  const sp = req.nextUrl.searchParams
  const g = sp.get('group_id'); if (g) { params.push(g); where += ` AND a.asset_group_id = $${params.length}` }
  const un = sp.get('unidade_id'); if (un) { params.push(un); where += ` AND a.unidade_id = $${params.length}` }
  const { rows } = await pool.query(
    `SELECT a.id, a.asset_group_id, a.unidade_id, a.name, a.subtype, a.manufacturer, a.model,
            a.serial_number, a.asset_tag, a.os, a.status, a.notes, a.created_at,
            g.name AS group_name, g.code AS group_code,
            un.code AS unidade_code, un.name AS unidade_name,
            co.name AS country_name, pl.name AS platform_name
       FROM public.assets a
       JOIN public.asset_groups g ON g.id = a.asset_group_id
       JOIN public.unidades un ON un.id = a.unidade_id
       LEFT JOIN public.countries co ON co.id = un.country_id
       LEFT JOIN public.platforms pl ON pl.id = co.platform_id
      WHERE ${where}
      ORDER BY a.created_at DESC`, params)
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const user = getCurrentUser(); if (!user || !canManageInventory(user)) return noauth()
  const b: any = await req.json().catch(() => null)
  if (!b?.asset_group_id || !b?.unidade_id) return NextResponse.json({ error: 'Grupo e unidade são obrigatórios.' }, { status: 400 })
  const chk = await checkUnidadesWritable(user, [b.unidade_id]); if (!chk.ok) return NextResponse.json({ error: outOfScopeMsg(chk.count) }, { status: 403 })
  const fields = FIELDS.filter(f => f in b)
  const vals = fields.map(f => b[f] === '' ? null : b[f])
  fields.push('created_by', 'updated_by'); vals.push(user.id, user.id)
  const ph = fields.map((_, i) => `$${i + 1}`).join(',')
  try {
    const { rows } = await pool.query(`INSERT INTO public.assets(${fields.join(',')}) VALUES(${ph}) RETURNING id`, vals)
    return NextResponse.json({ ok: true, id: rows[0].id })
  } catch (e: any) {
    if (e?.code === '23505') return NextResponse.json({ error: 'Patrimônio já cadastrado.' }, { status: 400 })
    return NextResponse.json({ error: e?.message || 'Erro ao inserir.' }, { status: 400 })
  }
}

export async function PATCH(req: NextRequest) {
  const user = getCurrentUser(); if (!user || !canManageInventory(user)) return noauth()
  const b: any = await req.json().catch(() => null)
  if (!b?.id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })
  const { rows: [cur] } = await pool.query('SELECT unidade_id FROM public.assets WHERE id=$1', [b.id])
  if (!cur) return NextResponse.json({ error: 'Ativo não encontrado.' }, { status: 404 })
  const toCheck = [cur.unidade_id, ...(b.unidade_id ? [b.unidade_id] : [])]
  const chk = await checkUnidadesWritable(user, toCheck); if (!chk.ok) return NextResponse.json({ error: outOfScopeMsg(chk.count) }, { status: 403 })
  const sets: string[] = [], vals: any[] = []
  let i = 1
  for (const f of FIELDS) if (f in b) { sets.push(`${f}=$${i++}`); vals.push(b[f] === '' ? null : b[f]) }
  sets.push(`updated_by=$${i++}`); vals.push(user.id)
  sets.push(`updated_at=now()`)
  vals.push(b.id)
  try {
    await pool.query(`UPDATE public.assets SET ${sets.join(',')} WHERE id=$${i}`, vals)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    if (e?.code === '23505') return NextResponse.json({ error: 'Patrimônio já cadastrado.' }, { status: 400 })
    return NextResponse.json({ error: e?.message || 'Erro ao atualizar.' }, { status: 400 })
  }
}

export async function DELETE(req: NextRequest) {
  const user = getCurrentUser(); if (!user || !canManageInventory(user)) return noauth()
  const b: any = await req.json().catch(() => null)
  if (!b?.id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })
  const { rows: [cur] } = await pool.query('SELECT unidade_id FROM public.assets WHERE id=$1', [b.id])
  if (!cur) return NextResponse.json({ ok: true })
  const chk = await checkUnidadesWritable(user, [cur.unidade_id]); if (!chk.ok) return NextResponse.json({ error: outOfScopeMsg(chk.count) }, { status: 403 })
  await pool.query('DELETE FROM public.assets WHERE id=$1', [b.id])
  return NextResponse.json({ ok: true })
}
