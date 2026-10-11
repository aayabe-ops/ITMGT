import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import pool from '@/lib/db'

const noauth = () => NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
const allowed = ['code', 'name', 'country_id', 'is_active']

// GET: Unidades com país e a lista de Centros de Custo (units) vinculados.
export async function GET() {
  const u = getCurrentUser(); if (!u) return noauth()
  const { rows } = await pool.query(
    `SELECT un.id, un.code, un.name, un.is_active, un.country_id,
            c.name AS country_name,
            COALESCE(ARRAY(SELECT u.id FROM public.units u WHERE u.unidade_id = un.id AND u.is_active = true ORDER BY u.code), '{}') AS cost_center_ids
       FROM public.unidades un
       LEFT JOIN public.countries c ON c.id = un.country_id
      WHERE un.is_active = true
      ORDER BY un.code`)
  return NextResponse.json(rows)
}

async function countryByCodeOrName(v: string): Promise<string | null> {
  if (!v) return null
  const { rows } = await pool.query('SELECT id FROM public.countries WHERE code=$1 OR lower(name)=lower($1) LIMIT 1', [v])
  return rows[0]?.id || null
}

// Vincula/desvincula Centros de Custo (units.unidade_id) da Unidade.
async function syncCostCenters(unidadeId: string, ids: any) {
  if (!Array.isArray(ids)) return
  await pool.query('UPDATE public.units SET unidade_id=NULL WHERE unidade_id=$1 AND NOT (id = ANY($2::uuid[]))', [unidadeId, ids])
  if (ids.length) await pool.query('UPDATE public.units SET unidade_id=$1 WHERE id = ANY($2::uuid[])', [unidadeId, ids])
}

export async function POST(req: NextRequest) {
  const user = getCurrentUser(); if (!user || user.role !== 'admin') return noauth()
  const b: any = await req.json().catch(() => null)
  const list: any[] = Array.isArray(b?.rows) ? b.rows : (b ? [b] : [])
  if (!list.length) return NextResponse.json({ error: 'Nada para salvar.' }, { status: 400 })

  let ok = 0, err = 0
  for (const r of list) {
    if (!r.code || !r.name) { err++; continue }
    try {
      const country_id = r.country_id || (r.pais ? await countryByCodeOrName(String(r.pais)) : null)
      const { rows } = await pool.query(
        `INSERT INTO public.unidades(code,name,country_id,is_active) VALUES($1,$2,$3,true)
         ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, country_id=EXCLUDED.country_id, is_active=true
         RETURNING id`,
        [r.code, r.name, country_id])
      if ('cost_center_ids' in r) await syncCostCenters(rows[0].id, r.cost_center_ids)
      ok++
    } catch { err++ }
  }
  return NextResponse.json(list.length === 1 && ok === 1 ? { ok: true } : { saved: ok, errors: err })
}

export async function PATCH(req: NextRequest) {
  const user = getCurrentUser(); if (!user || user.role !== 'admin') return noauth()
  const b: any = await req.json().catch(() => null)
  if (!b?.id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })
  const sets: string[] = [], vals: any[] = []
  let i = 1
  for (const f of allowed) if (f in b) { sets.push(`${f}=$${i++}`); vals.push(b[f] === '' ? null : b[f]) }
  try {
    if (sets.length) { vals.push(b.id); await pool.query(`UPDATE public.unidades SET ${sets.join(',')} WHERE id=$${i}`, vals) }
    if ('cost_center_ids' in b) await syncCostCenters(b.id, b.cost_center_ids)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.code === '23505' ? 'Código já existe.' : (e?.message || 'Erro ao atualizar.') }, { status: 400 })
  }
}

export async function DELETE(req: NextRequest) {
  const user = getCurrentUser(); if (!user || user.role !== 'admin') return noauth()
  const b: any = await req.json().catch(() => null)
  if (!b?.id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })
  try {
    await pool.query('UPDATE public.units SET unidade_id=NULL WHERE unidade_id=$1', [b.id])
    await pool.query('DELETE FROM public.unidades WHERE id=$1', [b.id])
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    if (e?.code === '23503') { await pool.query('UPDATE public.unidades SET is_active=false WHERE id=$1', [b.id]); return NextResponse.json({ ok: true, deactivated: true }) }
    return NextResponse.json({ error: 'Erro ao excluir.' }, { status: 400 })
  }
}
