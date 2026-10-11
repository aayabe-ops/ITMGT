import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import pool from '@/lib/db'

const noauth = () => NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

// Higienização de Centros de Custo órfãos (sem Unidade vinculada).
// GET  → lista os órfãos com uma Unidade sugerida (casada pelo centro logístico) + todas as unidades.
// POST → aplica os vínculos informados { links: [{ id, unidade_id }] }.
export async function GET() {
  const u = getCurrentUser(); if (!u || u.role !== 'admin') return noauth()
  const { rows: unidades } = await pool.query(
    'SELECT id, code, name FROM public.unidades WHERE is_active ORDER BY name')
  // órfãos ativos; sugere unidade onde o centro logístico bate com código/nome da unidade
  const { rows: orphans } = await pool.query(`
    SELECT un.id, un.code, un.name, COALESCE(un.centro_logistico_nome,'') AS cl,
           ud.id AS suggested_unidade_id,
           (SELECT count(*) FROM public.budget_lines b WHERE b.unit_id = un.id) AS budget_lines
      FROM public.units un
      LEFT JOIN public.unidades ud
        ON lower(ud.code) = lower(un.centro_logistico_nome)
        OR lower(ud.name) = lower(un.centro_logistico_nome)
     WHERE un.is_active AND un.unidade_id IS NULL
     ORDER BY (ud.id IS NULL), un.code`)
  return NextResponse.json({ orphans, unidades })
}

export async function POST(req: NextRequest) {
  const u = getCurrentUser(); if (!u || u.role !== 'admin') return noauth()
  const b: any = await req.json().catch(() => null)
  const links: any[] = Array.isArray(b?.links) ? b.links : []
  if (!links.length) return NextResponse.json({ error: 'Nada para vincular.' }, { status: 400 })
  let updated = 0, errors = 0
  for (const l of links) {
    if (!l?.id || !l?.unidade_id) { errors++; continue }
    try {
      await pool.query('UPDATE public.units SET unidade_id = $1 WHERE id = $2 AND is_active', [l.unidade_id, l.id])
      updated++
    } catch { errors++ }
  }
  return NextResponse.json({ updated, errors })
}
