import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import pool from '@/lib/db'

const noauth = () => NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

// GET: regras de rateio (evoluídas) com fornecedor, contrato, categoria, país,
// driver (allocation_drivers), vigência, status e unidades participantes.
export async function GET() {
  const user = getCurrentUser()
  if (!user || user.role !== 'admin') return noauth()

  const { rows } = await pool.query(`
    SELECT rc.id, rc.supplier_id, rc.contract_id, rc.category_id, rc.country_id, rc.driver_id,
           rc.version, rc.status, rc.is_active, rc.apply_budget, rc.apply_actual,
           rc.base_periodicity, rc.base_source, rc.forma,
           rc.step_order, rc.source_origin, rc.source_unit_id, rc.budget_value,
           COALESCE((SELECT json_agg(json_build_object('unit_id', w.unit_id, 'weight', w.weight))
                       FROM public.rateio_unit_weights w WHERE w.criteria_id = rc.id), '[]') AS unit_weights,
           to_char(rc.valid_from,'YYYY-MM-DD') AS valid_from,
           to_char(rc.valid_to,'YYYY-MM-DD')   AS valid_to,
           s.name AS supplier_name, s.short_name AS supplier_short_name,
           ct.name AS contract_name,
           c.name AS category_name,
           co.name AS country_name,
           ad.code AS driver_code, ad.name AS driver_name, ad.kind AS driver_kind, ad.unit_label AS driver_unit,
           CASE WHEN ad.kind='VALUE'
                THEN (SELECT count(DISTINCT unit_id) FROM public.driver_values dv WHERE dv.driver_id = rc.driver_id)::int
                ELSE NULL END AS base_units,
           COALESCE((SELECT SUM(weight) FROM public.rateio_unit_weights w WHERE w.criteria_id = rc.id), 0) AS weights_sum,
           COALESCE(ARRAY(SELECT unit_id FROM public.rateio_criteria_units WHERE criteria_id = rc.id), '{}') AS unit_ids
    FROM public.rateio_criteria rc
    LEFT JOIN public.suppliers s          ON s.id  = rc.supplier_id
    LEFT JOIN public.contracts ct         ON ct.id = rc.contract_id
    LEFT JOIN public.categories c         ON c.id  = rc.category_id
    LEFT JOIN public.countries co         ON co.id = rc.country_id
    LEFT JOIN public.allocation_drivers ad ON ad.id = rc.driver_id
    ORDER BY rc.created_at DESC
  `)
  return NextResponse.json(rows)
}

// PUT — edita uma regra existente (todos os campos + unidades participantes).
export async function PUT(req: NextRequest) {
  const user = getCurrentUser()
  if (!user || user.role !== 'admin') return noauth()
  const body: any = await req.json().catch(() => null)
  if (!body?.id) return NextResponse.json({ error: 'ID da regra é obrigatório.' }, { status: 400 })
  const { id, supplier_id, contract_id, category_id, country_id, driver_id,
          valid_from, valid_to, apply_budget, apply_actual, status,
          base_periodicity, base_source, unit_ids, forma,
          step_order, source_origin, source_unit_id, budget_value } = body
  if (!supplier_id || !driver_id) return NextResponse.json({ error: 'Fornecedor e Driver são obrigatórios.' }, { status: 400 })
  const st = ['DRAFT', 'ACTIVE', 'INACTIVE'].includes(status) ? status : 'DRAFT'

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `UPDATE public.rateio_criteria SET
         supplier_id=$2, contract_id=$3, category_id=$4, country_id=$5, driver_id=$6,
         valid_from=COALESCE($7::date, valid_from), valid_to=$8::date,
         apply_budget=$9, apply_actual=$10, status=$11, is_active=$12,
         base_periodicity=COALESCE($13, base_periodicity), base_source=$14,
         step_order=COALESCE($15,1), source_origin=COALESCE($16,'INICIAL'),
         source_unit_id=$17, budget_value=$18, forma=COALESCE($19, forma)
       WHERE id=$1`,
      [id, supplier_id, contract_id || null, category_id || null, country_id || null, driver_id,
       valid_from || null, valid_to || null, !!apply_budget, apply_actual !== false, st, st !== 'INACTIVE',
       base_periodicity || null, base_source || null,
       parseInt(step_order) || 1, source_origin || 'INICIAL', source_unit_id || null,
       (budget_value === '' || budget_value == null) ? null : Number(budget_value), forma || null])
    // substitui as unidades participantes
    await client.query('DELETE FROM public.rateio_criteria_units WHERE criteria_id=$1', [id])
    if (Array.isArray(unit_ids)) {
      for (const uid of unit_ids) {
        if (!uid) continue
        await client.query(
          `INSERT INTO public.rateio_criteria_units(criteria_id, unit_id)
           VALUES($1,$2) ON CONFLICT (criteria_id, unit_id) DO NOTHING`, [id, uid])
      }
    }
    await client.query('COMMIT')
    return NextResponse.json({ ok: true, id })
  } catch (e: any) {
    await client.query('ROLLBACK')
    return NextResponse.json({ error: e?.message || 'Erro ao editar regra.' }, { status: 400 })
  } finally { client.release() }
}

export async function POST(req: NextRequest) {
  const user = getCurrentUser()
  if (!user || user.role !== 'admin') return noauth()
  const body: any = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Corpo inválido' }, { status: 400 })

  // (C) Mudança de status da regra (ativar/inativar) — usado pelo assistente
  if (body.id && body.set_status) {
    const st = ['DRAFT', 'ACTIVE', 'INACTIVE'].includes(body.set_status) ? body.set_status : null
    if (!st) return NextResponse.json({ error: 'Status inválido.' }, { status: 400 })
    await pool.query(`UPDATE public.rateio_criteria SET status=$1, is_active=$2 WHERE id=$3`, [st, st !== 'INACTIVE', body.id])
    return NextResponse.json({ ok: true })
  }

  // (A) Pesos/quantidades de um critério, por UNIDADE.
  //     allow_any_sum=true (forma QUANTIDADE/DIRETO): não exige soma 100 — o motor normaliza por soma.
  //     Sem a flag (forma PERCENTUAL): exige soma 100%.
  if (body.criteria_id && body.unit_weights) {
    if (!body.allow_any_sum) {
      const sum = body.unit_weights.reduce((s: number, w: any) => s + (Number(w.weight) || 0), 0)
      if (Math.abs(sum - 100) > 0.01) {
        return NextResponse.json({ error: `Os percentuais devem somar 100% (atual: ${sum.toFixed(2)}%).` }, { status: 400 })
      }
    }
    const ids = body.unit_weights.map((w: any) => w.unit_id).filter(Boolean)
    // remove pesos de unidades que não fazem mais parte
    if (ids.length) await pool.query(`DELETE FROM public.rateio_unit_weights WHERE criteria_id=$1 AND unit_id <> ALL($2::uuid[])`, [body.criteria_id, ids])
    else await pool.query(`DELETE FROM public.rateio_unit_weights WHERE criteria_id=$1`, [body.criteria_id])
    for (const w of body.unit_weights) {
      if (!w.unit_id) continue
      await pool.query(
        `INSERT INTO public.rateio_unit_weights(criteria_id, unit_id, weight)
         VALUES($1,$2,$3) ON CONFLICT (criteria_id, unit_id) DO UPDATE SET weight=$3`,
        [body.criteria_id, w.unit_id, Number(w.weight) || 0])
    }
    return NextResponse.json({ ok: true })
  }

  // (B) Nova regra de rateio (evoluída)
  const { supplier_id, contract_id, category_id, country_id, driver_id,
          valid_from, valid_to, apply_budget, apply_actual, status,
          base_periodicity, base_source, unit_ids, forma,
          step_order, source_origin, source_unit_id, budget_value } = body
  if (!supplier_id || !driver_id) {
    return NextResponse.json({ error: 'Fornecedor e Driver são obrigatórios.' }, { status: 400 })
  }
  const st = ['DRAFT', 'ACTIVE', 'INACTIVE'].includes(status) ? status : 'DRAFT'

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(
      `INSERT INTO public.rateio_criteria
         (supplier_id, contract_id, category_id, country_id, driver_id,
          valid_from, valid_to, apply_budget, apply_actual, status, base_periodicity, base_source, is_active,
          step_order, source_origin, source_unit_id, budget_value, forma)
       VALUES ($1,$2,$3,$4,$5,
               COALESCE($6::date, CURRENT_DATE), $7::date, $8, $9, $10, COALESCE($11,'MENSAL'), $12, $13,
               COALESCE($14,1), COALESCE($15,'INICIAL'), $16, $17, $18)
       RETURNING id`,
      [supplier_id, contract_id || null, category_id || null, country_id || null, driver_id,
       valid_from || null, valid_to || null, !!apply_budget, apply_actual !== false, st,
       base_periodicity || null, base_source || null, st !== 'INACTIVE',
       parseInt(step_order) || 1, source_origin || 'INICIAL', source_unit_id || null,
       (budget_value === '' || budget_value == null) ? null : Number(budget_value), forma || null])
    const id = rows[0].id
    if (Array.isArray(unit_ids)) {
      for (const uid of unit_ids) {
        if (!uid) continue
        await client.query(
          `INSERT INTO public.rateio_criteria_units(criteria_id, unit_id)
           VALUES($1,$2) ON CONFLICT (criteria_id, unit_id) DO NOTHING`, [id, uid])
      }
    }
    await client.query('COMMIT')
    return NextResponse.json({ ok: true, id })
  } catch (e: any) {
    await client.query('ROLLBACK')
    return NextResponse.json({ error: e?.message || 'Erro ao salvar regra.' }, { status: 400 })
  } finally { client.release() }
}
