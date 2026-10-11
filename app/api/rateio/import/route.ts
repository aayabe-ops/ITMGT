import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import pool from '@/lib/db'
import { norm, driverCodeFor, ImportContract, ImportParticipant } from '@/lib/rateioImport'

const noauth = () => NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
const YEAR = 2027

// tenta casar o CC da planilha ("FG-PNG | TI") com units.code (várias variações)
function matchUnit(cc: string, byCode: Map<string, string>): string | null {
  const cand = [
    norm(cc),
    norm(String(cc).split('|')[0]),
    norm(String(cc).replace(/\|/g, ' ')),
    norm(String(cc).replace(/[^a-z0-9]/gi, '')),
  ]
  for (const c of cand) { const id = byCode.get(c); if (id) return id }
  return null
}

export async function POST(req: NextRequest) {
  const user = getCurrentUser(); if (!user || user.role !== 'admin') return noauth()
  const body: any = await req.json().catch(() => null)
  const contracts: ImportContract[] = Array.isArray(body?.contracts) ? body.contracts : []
  const commit = body?.mode === 'commit'
  if (!contracts.length) return NextResponse.json({ error: 'Nenhum contrato para importar.' }, { status: 400 })

  // lookups
  const units = (await pool.query(`SELECT id, code FROM public.units WHERE is_active=true`)).rows
  const unitByCode = new Map<string, string>()
  for (const u of units) {
    for (const k of [norm(u.code), norm(String(u.code).split('|')[0]), norm(String(u.code).replace(/[^a-z0-9]/gi, ''))]) if (k && !unitByCode.has(k)) unitByCode.set(k, u.id)
  }
  const suppliers = (await pool.query(`SELECT id, name, short_name FROM public.suppliers`)).rows
  const supByName = new Map<string, string>()
  for (const s of suppliers) { for (const k of [norm(s.name), norm(s.short_name)]) if (k) supByName.set(k, s.id) }
  const drivers = (await pool.query(`SELECT id, code FROM public.allocation_drivers`)).rows
  const driverByCode = new Map(drivers.map((d: any) => [d.code, d.id]))

  // análise
  const report = {
    contracts: contracts.length, participants: 0, matchedCC: 0, unmatchedCC: [] as string[],
    suppliersToCreate: [] as string[], driversMissing: [] as string[], errors: [] as string[],
    created: 0, updated: 0, weights: 0, bases: 0,
  }
  const unmatchedSet = new Set<string>(), supCreateSet = new Set<string>(), drvMissSet = new Set<string>()

  const resolved = contracts.map(c => {
    const code = driverCodeFor(c.regra, c.premissa)
    const driver_id = code ? driverByCode.get(code) : null
    if (!driver_id) drvMissSet.add(`${c.ext_ref}: ${c.regra} / ${c.premissa}`)
    const supId = supByName.get(norm(c.supplier)) || null
    if (!supId) supCreateSet.add(c.supplier)
    const parts = (c.participants || []).map((p: ImportParticipant) => {
      report.participants++
      const unit_id = matchUnit(p.cc, unitByCode)
      if (unit_id) report.matchedCC++; else unmatchedSet.add(p.cc)
      return { ...p, unit_id }
    })
    return { c, code, driver_id, supId, parts }
  })
  report.unmatchedCC = [...unmatchedSet].slice(0, 100)
  report.suppliersToCreate = [...supCreateSet]
  report.driversMissing = [...drvMissSet]

  if (!commit) return NextResponse.json({ mode: 'preview', ...report })

  // commit — transação
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // cria fornecedores faltantes
    const supCache = new Map(supByName)
    for (const name of supCreateSet) {
      const { rows } = await client.query(`INSERT INTO public.suppliers(name, short_name) VALUES($1,$1) RETURNING id`, [name])
      supCache.set(norm(name), rows[0].id)
    }
    for (const r of resolved) {
      if (!r.driver_id) { report.errors.push(`Driver não resolvido: ${r.c.ext_ref}`); continue }
      const supId = r.supId || supCache.get(norm(r.c.supplier))
      const kind = r.code === 'DIRECT' ? 'DIRECT' : r.code === 'EQUAL' ? 'EQUAL' : r.code === 'MANUAL' ? 'MANUAL' : 'VALUE'
      const baseSrc = `Excel 2027 • ${r.c.regra} • total R$ ${Number(r.c.total || 0).toLocaleString('pt-BR')}`
      // upsert do critério por ext_ref
      const existing = (await client.query(`SELECT id, version FROM public.rateio_criteria WHERE ext_ref=$1`, [r.c.ext_ref])).rows[0]
      let cid: string
      if (existing) {
        cid = existing.id
        await client.query(
          `UPDATE public.rateio_criteria SET supplier_id=$1, driver_id=$2, status='ACTIVE', is_active=true,
             apply_actual=true, apply_budget=true, base_source=$3, version=version+1,
             valid_from=make_date($4,1,1), valid_to=make_date($4,12,31) WHERE id=$5`,
          [supId, r.driver_id, baseSrc, YEAR, cid])
        report.updated++
      } else {
        const { rows } = await client.query(
          `INSERT INTO public.rateio_criteria
             (supplier_id, driver_id, status, is_active, apply_actual, apply_budget, base_source, version, valid_from, valid_to, ext_ref)
           VALUES($1,$2,'ACTIVE',true,true,true,$3,1, make_date($4,1,1), make_date($4,12,31), $5) RETURNING id`,
          [supId, r.driver_id, baseSrc, YEAR, r.c.ext_ref])
        cid = rows[0].id; report.created++
      }
      // participantes (regenera)
      await client.query(`DELETE FROM public.rateio_criteria_units WHERE criteria_id=$1`, [cid])
      await client.query(`DELETE FROM public.rateio_unit_weights WHERE criteria_id=$1`, [cid])
      for (const p of r.parts) {
        if (!p.unit_id) continue
        await client.query(`INSERT INTO public.rateio_criteria_units(criteria_id, unit_id) VALUES($1,$2) ON CONFLICT DO NOTHING`, [cid, p.unit_id])
        // DIRETO → peso = valor absoluto por CC
        if (kind === 'DIRECT' && p.valor != null && Number(p.valor) > 0) {
          await client.query(
            `INSERT INTO public.rateio_unit_weights(criteria_id, unit_id, weight) VALUES($1,$2,$3)
             ON CONFLICT (criteria_id, unit_id) DO UPDATE SET weight=$3`, [cid, p.unit_id, Number(p.valor)])
          report.weights++
        }
        // PERCENTUAL → peso = %
        if (kind === 'MANUAL' && p.pct != null && Number(p.pct) > 0) {
          await client.query(
            `INSERT INTO public.rateio_unit_weights(criteria_id, unit_id, weight) VALUES($1,$2,$3)
             ON CONFLICT (criteria_id, unit_id) DO UPDATE SET weight=$3`, [cid, p.unit_id, Number(p.pct)])
          report.weights++
        }
        // PROPORCIONAL → base do driver (qtde informada; ou Receita líquida da aba Listas)
        if (kind === 'VALUE') {
          const q = (p.qtde != null && Number(p.qtde) > 0) ? Number(p.qtde)
                  : (r.code === 'P_RECEITA_LIQ' && p.receita_liq != null && Number(p.receita_liq) > 0) ? Number(p.receita_liq)
                  : null
          if (q != null) {
            for (const sc of ['ACTUAL', 'BUDGET']) for (let m = 1; m <= 12; m++) {
              await client.query(
                `INSERT INTO public.driver_values(unit_id, driver_id, year, month, scenario, value) VALUES($1,$2,$3,$4,$5,$6)
                 ON CONFLICT (unit_id, driver_id, year, month, scenario) DO UPDATE SET value=EXCLUDED.value`,
                [p.unit_id, r.driver_id, YEAR, m, sc, q])
            }
            report.bases++
          }
        }
      }
    }
    await client.query('COMMIT')
    return NextResponse.json({ mode: 'commit', ...report })
  } catch (e: any) {
    await client.query('ROLLBACK')
    return NextResponse.json({ error: e?.message || 'Erro ao importar.', ...report }, { status: 400 })
  } finally { client.release() }
}
