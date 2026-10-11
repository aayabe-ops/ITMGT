import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import pool from '@/lib/db'

const noauth = () => NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

// GET ?driver_id=&year=&month=&scenario= → valores da base por unidade (um mês, com herança)
// GET ?driver_id=&year=&scenario=&all=1  → TODOS os meses (matriz): rows:[{unit_id, month, value}]
export async function GET(req: NextRequest) {
  const user = getCurrentUser(); if (!user || user.role !== 'admin') return noauth()
  const sp = req.nextUrl.searchParams
  const driver_id = sp.get('driver_id'); const year = sp.get('year'); const month = sp.get('month')
  const scenario = sp.get('scenario') === 'BUDGET' ? 'BUDGET' : 'ACTUAL'

  // Modo matriz: todos os meses do ano de uma vez (sem herança — valores efetivamente gravados).
  if (sp.get('all') === '1') {
    if (!driver_id || !year) return NextResponse.json({ rows: [], mode: 'all' })
    const { rows } = await pool.query(
      `SELECT unit_id, month, value FROM public.driver_values
        WHERE driver_id=$1 AND year=$2 AND scenario=$3`,
      [driver_id, year, scenario])
    return NextResponse.json({ rows, mode: 'all' })
  }

  if (!driver_id || !year || !month) return NextResponse.json({ rows: [], updated_at: null, updated_by_name: null, inherited_from: null })

  // Herança: usa o próprio mês se tiver base; senão o último mês anterior (no ano) com base.
  const { rows: eff } = await pool.query(
    `SELECT max(month) AS m FROM public.driver_values WHERE driver_id=$1 AND year=$2 AND scenario=$3 AND month <= $4`,
    [driver_id, year, scenario, month])
  const effMonth: number | null = eff[0]?.m ?? null
  const inherited_from = (effMonth != null && String(effMonth) !== String(month)) ? effMonth : null

  let rows: any[] = []
  let meta: any = { updated_at: null, updated_by_name: null }
  if (effMonth != null) {
    rows = (await pool.query(
      `SELECT unit_id, value FROM public.driver_values WHERE driver_id=$1 AND year=$2 AND month=$3 AND scenario=$4`,
      [driver_id, year, effMonth, scenario])).rows
    const m = await pool.query(
      `SELECT max(dv.updated_at) AS updated_at,
              (SELECT COALESCE(u.full_name, u.email) FROM public.driver_values d2
                 LEFT JOIN public.users u ON u.id = d2.updated_by
                WHERE d2.driver_id=$1 AND d2.year=$2 AND d2.month=$3 AND d2.scenario=$4
                ORDER BY d2.updated_at DESC NULLS LAST LIMIT 1) AS updated_by_name
         FROM public.driver_values dv
        WHERE dv.driver_id=$1 AND dv.year=$2 AND dv.month=$3 AND dv.scenario=$4`,
      [driver_id, year, effMonth, scenario])
    meta = m.rows[0] || meta
  }
  return NextResponse.json({ rows, inherited_from, updated_at: meta.updated_at || null, updated_by_name: meta.updated_by_name || null })
}

// POST { driver_id, year, scenario, month?, values:[{unit_id, value, month?}] } → upsert em lote.
// month pode vir por item (matriz de 12 meses) ou no topo (compat. 1 mês). Valor 0/vazio apaga.
export async function POST(req: NextRequest) {
  const user = getCurrentUser(); if (!user || user.role !== 'admin') return noauth()
  const b: any = await req.json().catch(() => null)
  if (!b?.driver_id || !b?.year || !Array.isArray(b?.values)) {
    return NextResponse.json({ error: 'driver_id, year e values são obrigatórios.' }, { status: 400 })
  }
  const scenario = b.scenario === 'BUDGET' ? 'BUDGET' : 'ACTUAL'
  const client = await pool.connect()
  let ok = 0
  try {
    await client.query('BEGIN')
    for (const v of b.values) {
      const mo = parseInt(v.month ?? b.month)
      if (!v.unit_id || !(mo >= 1 && mo <= 12)) continue
      const val = Number(v.value)
      if (isFinite(val) && val > 0) {
        await client.query(
          `INSERT INTO public.driver_values(unit_id, driver_id, year, month, scenario, value, updated_at, updated_by)
           VALUES($1,$2,$3,$4,$5,$6, now(), $7)
           ON CONFLICT (unit_id, driver_id, year, month, scenario)
           DO UPDATE SET value=EXCLUDED.value, updated_at=now(), updated_by=$7`,
          [v.unit_id, b.driver_id, b.year, mo, scenario, val, user.id])
        ok++
      } else {
        await client.query(
          `DELETE FROM public.driver_values
            WHERE unit_id=$1 AND driver_id=$2 AND year=$3 AND month=$4 AND scenario=$5`,
          [v.unit_id, b.driver_id, b.year, mo, scenario])
      }
    }
    await client.query('COMMIT')
    return NextResponse.json({ ok: true, saved: ok })
  } catch (e: any) {
    await client.query('ROLLBACK')
    return NextResponse.json({ error: e?.message || 'Erro ao salvar base.' }, { status: 400 })
  } finally { client.release() }
}
