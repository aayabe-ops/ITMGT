import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import pool from '@/lib/db'
import { computeAllocation } from '@/lib/rateio'

// POST { criteria_id, cost, year, month, scenario } → prévia da distribuição (não persiste).
export async function POST(req: NextRequest) {
  const user = getCurrentUser(); if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const b: any = await req.json().catch(() => null)
  const cost = Number(b?.cost)
  if (!b?.criteria_id || !isFinite(cost) || cost <= 0) return NextResponse.json({ error: 'criteria_id e custo (>0) são obrigatórios.' }, { status: 400 })
  const year = parseInt(b.year) || new Date().getFullYear()
  const month = parseInt(b.month) || 1
  const scenario = b.scenario === 'BUDGET' ? 'BUDGET' : 'ACTUAL'

  const { rows: [rc] } = await pool.query(
    `SELECT rc.id, rc.driver_id, ad.code AS driver_code, ad.kind AS driver_kind
       FROM public.rateio_criteria rc LEFT JOIN public.allocation_drivers ad ON ad.id = rc.driver_id
      WHERE rc.id = $1`, [b.criteria_id])
  if (!rc) return NextResponse.json({ error: 'Regra não encontrada.' }, { status: 404 })

  // centros de custo participantes (fallback: todos ativos)
  let pu = (await pool.query(
    `SELECT u.id AS unit_id, u.code, COALESCE(ud.name, u.name) AS name FROM public.rateio_criteria_units rcu
       JOIN public.units u ON u.id = rcu.unit_id
       LEFT JOIN public.unidades ud ON ud.id = u.unidade_id
      WHERE rcu.criteria_id = $1 ORDER BY u.code`, [b.criteria_id])).rows
  if (!pu.length) pu = (await pool.query(`SELECT u.id AS unit_id, u.code, COALESCE(ud.name, u.name) AS name FROM public.units u LEFT JOIN public.unidades ud ON ud.id = u.unidade_id WHERE u.is_active=true ORDER BY u.code`)).rows
  const nameOf = new Map(pu.map((u: any) => [u.unit_id, { code: u.code, name: u.name }]))

  const driverValues: Record<string, number> = {}
  const weights: Record<string, number> = {}
  if (rc.driver_kind === 'VALUE') {
    const { rows } = await pool.query(
      `SELECT unit_id, value FROM public.driver_values WHERE driver_id=$1 AND year=$2 AND month=$3 AND scenario=$4`,
      [rc.driver_id, year, month, scenario])
    for (const r of rows) driverValues[r.unit_id] = Number(r.value)
  } else if (rc.driver_kind === 'MANUAL' || rc.driver_kind === 'DIRECT') {
    const { rows } = await pool.query(`SELECT unit_id, weight FROM public.rateio_unit_weights WHERE criteria_id=$1`, [b.criteria_id])
    for (const r of rows) weights[r.unit_id] = Number(r.weight)
  }

  const res = computeAllocation({ cost, driverKind: (rc.driver_kind || 'EQUAL'), units: pu.map((u: any) => ({ unit_id: u.unit_id })), driverValues, weights })
  const lines = res.lines.map(l => ({ ...l, code: nameOf.get(l.unit_id)?.code, name: nameOf.get(l.unit_id)?.name }))
  return NextResponse.json({ driver_code: rc.driver_code, driver_kind: rc.driver_kind, driver_total: res.driver_total, cost, reconciled: res.reconciled, ok: res.ok, lines })
}
