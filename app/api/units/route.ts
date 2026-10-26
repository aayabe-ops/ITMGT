import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import pool from '@/lib/db'

const noauth = () => NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
const allowed = ['code', 'name', 'type', 'company_id', 'country_id', 'is_active', 'cost_nature',
  'descr_en', 'centro_logistico_id', 'centro_logistico_nome', 'divisao_id', 'divisao_nome', 'unidade_id']

// GET: Centro de Custo com Empresa, Unidade (agrupadora), Centro Logístico e Divisão.
export async function GET() {
  const u = getCurrentUser(); if (!u) return noauth()
  const { rows } = await pool.query(
    `SELECT un.id, un.code, un.name, un.is_active, un.company_id, un.country_id, un.unidade_id, un.cost_nature,
            un.descr_en, un.centro_logistico_id, un.centro_logistico_nome, un.divisao_id, un.divisao_nome,
            co.code AS company_code, co.name AS company_name, co.name AS parent_name,
            ct.name AS country_name, ct.code AS country_code,
            ud.code AS unidade_code, ud.name AS unidade_nome
       FROM public.units un
       LEFT JOIN public.companies co ON co.id = un.company_id
       LEFT JOIN public.countries ct ON ct.id = un.country_id
       LEFT JOIN public.unidades  ud ON ud.id = un.unidade_id
      WHERE un.is_active = true
      ORDER BY un.code`)
  return NextResponse.json(rows)
}

async function countryByCodeOrName(v: string): Promise<string | null> {
  if (!v) return null
  const { rows } = await pool.query('SELECT id FROM public.countries WHERE code=$1 OR lower(name)=lower($1) LIMIT 1', [v])
  return rows[0]?.id || null
}

// Resolve a Unidade (unidades) por código ou nome — para vincular o CC no upload CSV.
async function unidadeByCodeOrName(v: string): Promise<string | null> {
  if (!v) return null
  const { rows } = await pool.query('SELECT id FROM public.unidades WHERE code=$1 OR lower(name)=lower($1) LIMIT 1', [v])
  return rows[0]?.id || null
}

// Resolve/crie empresa pelo código (para o upload CSV). Retorna company_id.
async function companyByCode(code: string, name: string | null): Promise<string | null> {
  if (!code) return null
  const { rows } = await pool.query('SELECT id FROM public.companies WHERE code=$1', [code])
  if (rows[0]) return rows[0].id
  const brl = await pool.query(`SELECT id FROM public.countries WHERE code='BR'`)
  const ins = await pool.query(
    'INSERT INTO public.companies(code,name,country_id) VALUES($1,$2,$3) ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name RETURNING id',
    [code, name || code, brl.rows[0]?.id || null])
  return ins.rows[0].id
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
      const company_id = r.company_id || (r.empresa_code ? await companyByCode(String(r.empresa_code), r.empresa_nome || null) : null)
      const country_id = r.country_id || (r.pais ? await countryByCodeOrName(String(r.pais)) : null)
      const unidade_id = r.unidade_id || (r.unidade ? await unidadeByCodeOrName(String(r.unidade)) : null)
      await pool.query(
        `INSERT INTO public.units(code,name,type,company_id,country_id,descr_en,centro_logistico_id,centro_logistico_nome,divisao_id,divisao_nome,unidade_id,is_active)
         VALUES($1,$2,'OPERACIONAL',$3,COALESCE($9,(SELECT country_id FROM public.companies WHERE id=$3),(SELECT id FROM public.countries WHERE code='BR')),$4,$5,$6,$7,$8,$10,true)
         ON CONFLICT (code) DO UPDATE SET
           name=EXCLUDED.name, company_id=EXCLUDED.company_id, country_id=EXCLUDED.country_id,
           descr_en=EXCLUDED.descr_en, centro_logistico_id=EXCLUDED.centro_logistico_id, centro_logistico_nome=EXCLUDED.centro_logistico_nome,
           divisao_id=EXCLUDED.divisao_id, divisao_nome=EXCLUDED.divisao_nome, unidade_id=EXCLUDED.unidade_id, is_active=true`,
        [r.code, r.name, company_id, r.descr_en || null, r.centro_logistico_id || null, r.centro_logistico_nome || null, r.divisao_id || null, r.divisao_nome || null, country_id, unidade_id])
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
    if (sets.length) { vals.push(b.id); await pool.query(`UPDATE public.units SET ${sets.join(',')} WHERE id=$${i}`, vals) }
    if ('company_id' in b) await pool.query(`UPDATE public.units SET country_id=(SELECT country_id FROM public.companies WHERE id=$1) WHERE id=$2`, [b.company_id || null, b.id])
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erro ao atualizar.' }, { status: 400 })
  }
}

export async function DELETE(req: NextRequest) {
  const user = getCurrentUser(); if (!user || user.role !== 'admin') return noauth()
  const b: any = await req.json().catch(() => null)
  if (!b?.id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })
  try {
    await pool.query(`DELETE FROM public.units WHERE id=$1`, [b.id])
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    if (e?.code === '23503') {
      await pool.query(`UPDATE public.units SET is_active=false WHERE id=$1`, [b.id])
      return NextResponse.json({ ok: true, deactivated: true })
    }
    return NextResponse.json({ error: 'Erro ao excluir.' }, { status: 400 })
  }
}
