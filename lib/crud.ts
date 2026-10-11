import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import pool from '@/lib/db'

const noauth = () => NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

// Mensagem amigável para violação de unicidade (código x nome)
function dupMsg(e: any): string {
  if (e?.code !== '23505') return 'Erro ao salvar.'
  const con = String(e?.constraint || '')
  if (/name/i.test(con)) return 'Nome já cadastrado.'
  return 'Código já existe.'
}

// Gera handlers GET/POST/PATCH/DELETE para uma tabela de lookup (code, name, [description], is_active).
// `table` é controlado pelo código (não é entrada do usuário).
// `extraCols` (controladas pelo código) permitem campos além de code/name/description,
// ex.: categories.cost_class. Nunca vêm de entrada do usuário.
export function lookupRoutes(table: string, hasDescription = false, extraCols: string[] = []) {
  const base = hasDescription ? ['id', 'code', 'name', 'description', 'is_active'] : ['id', 'code', 'name', 'is_active']
  const cols = [...base, ...extraCols].join(', ')

  async function GET() {
    const u = getCurrentUser(); if (!u) return noauth()
    const { rows } = await pool.query(`SELECT ${cols} FROM public.${table} ORDER BY name`)
    return NextResponse.json(rows)
  }

  async function POST(req: NextRequest) {
    const u = getCurrentUser(); if (!u || u.role !== 'admin') return noauth()
    const b: any = await req.json().catch(() => null)
    if (!b?.code || !b?.name) return NextResponse.json({ error: 'Código e nome são obrigatórios.' }, { status: 400 })
    const fields = ['code', 'name'], vals: any[] = [b.code, b.name]
    if (hasDescription) { fields.push('description'); vals.push(b.description ?? null) }
    for (const c of extraCols) { fields.push(c); vals.push(b[c] ?? null) }
    const ph = fields.map((_, i) => `$${i + 1}`).join(',')
    try {
      const { rows } = await pool.query(`INSERT INTO public.${table}(${fields.join(',')}) VALUES(${ph}) RETURNING ${cols}`, vals)
      return NextResponse.json(rows[0])
    } catch (e: any) {
      return NextResponse.json({ error: e?.code === '23505' ? 'Código já existe.' : 'Erro ao inserir.' }, { status: 400 })
    }
  }

  async function PATCH(req: NextRequest) {
    const u = getCurrentUser(); if (!u || u.role !== 'admin') return noauth()
    const b: any = await req.json().catch(() => null)
    if (!b?.id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })
    const allowed = [...(hasDescription ? ['code', 'name', 'description'] : ['code', 'name']), ...extraCols, 'is_active']
    const sets: string[] = [], vals: any[] = []
    let i = 1
    for (const f of allowed) if (f in b) { sets.push(`${f}=$${i++}`); vals.push(b[f]) }
    if (!sets.length) return NextResponse.json({ ok: true })
    vals.push(b.id)
    try {
      await pool.query(`UPDATE public.${table} SET ${sets.join(',')} WHERE id=$${i}`, vals)
      return NextResponse.json({ ok: true })
    } catch (e: any) {
      return NextResponse.json({ error: e?.code === '23505' ? 'Código já existe.' : 'Erro ao atualizar.' }, { status: 400 })
    }
  }

  async function DELETE(req: NextRequest) {
    const u = getCurrentUser(); if (!u || u.role !== 'admin') return noauth()
    const b: any = await req.json().catch(() => null)
    if (!b?.id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })
    try {
      await pool.query(`DELETE FROM public.${table} WHERE id=$1`, [b.id])
      return NextResponse.json({ ok: true })
    } catch (e: any) {
      if (e?.code === '23503') { // em uso por FK → desativa
        await pool.query(`UPDATE public.${table} SET is_active=false WHERE id=$1`, [b.id])
        return NextResponse.json({ ok: true, deactivated: true }, { status: 200 })
      }
      return NextResponse.json({ error: 'Erro ao excluir.' }, { status: 400 })
    }
  }

  return { GET, POST, PATCH, DELETE }
}

// Igual ao lookup, mas com um campo pai (FK), ex.: countries.platform_id, units.country_id.
export function hierRoutes(table: string, parentField: string, parentTable: string) {
  const allowed = ['code', 'name', parentField, 'is_active']

  async function GET() {
    const u = getCurrentUser(); if (!u) return noauth()
    const { rows } = await pool.query(
      `SELECT t.id, t.code, t.name, t.is_active, t.${parentField},
              p.name AS parent_name
         FROM public.${table} t
         LEFT JOIN public.${parentTable} p ON p.id = t.${parentField}
        ORDER BY t.name`)
    return NextResponse.json(rows)
  }

  async function POST(req: NextRequest) {
    const u = getCurrentUser(); if (!u || u.role !== 'admin') return noauth()
    const b: any = await req.json().catch(() => null)
    if (!b?.code || !b?.name) return NextResponse.json({ error: 'Código e nome são obrigatórios.' }, { status: 400 })
    try {
      const { rows } = await pool.query(
        `INSERT INTO public.${table}(code, name, ${parentField}) VALUES($1,$2,$3)
         RETURNING id, code, name, is_active, ${parentField}`,
        [b.code, b.name, b[parentField] || null])
      return NextResponse.json(rows[0])
    } catch (e: any) {
      return NextResponse.json({ error: dupMsg(e) }, { status: 400 })
    }
  }

  async function PATCH(req: NextRequest) {
    const u = getCurrentUser(); if (!u || u.role !== 'admin') return noauth()
    const b: any = await req.json().catch(() => null)
    if (!b?.id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })
    const sets: string[] = [], vals: any[] = []
    let i = 1
    for (const f of allowed) if (f in b) { sets.push(`${f}=$${i++}`); vals.push(b[f] === '' ? null : b[f]) }
    if (!sets.length) return NextResponse.json({ ok: true })
    vals.push(b.id)
    try {
      await pool.query(`UPDATE public.${table} SET ${sets.join(',')} WHERE id=$${i}`, vals)
      return NextResponse.json({ ok: true })
    } catch (e: any) {
      return NextResponse.json({ error: dupMsg(e) }, { status: 400 })
    }
  }

  async function DELETE(req: NextRequest) {
    const u = getCurrentUser(); if (!u || u.role !== 'admin') return noauth()
    const b: any = await req.json().catch(() => null)
    if (!b?.id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })
    try {
      await pool.query(`DELETE FROM public.${table} WHERE id=$1`, [b.id])
      return NextResponse.json({ ok: true })
    } catch (e: any) {
      if (e?.code === '23503') {
        await pool.query(`UPDATE public.${table} SET is_active=false WHERE id=$1`, [b.id])
        return NextResponse.json({ ok: true, deactivated: true })
      }
      return NextResponse.json({ error: 'Erro ao excluir.' }, { status: 400 })
    }
  }

  return { GET, POST, PATCH, DELETE }
}
