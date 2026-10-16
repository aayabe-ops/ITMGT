import pool from '@/lib/db'
import { computeAllocation } from '@/lib/rateio'

export async function isPeriodClosed(year: number, month: number, scenario: 'ACTUAL' | 'BUDGET'): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM public.closed_periods WHERE year=$1 AND month=$2 AND scenario IN ('ALL',$3) LIMIT 1`,
    [year, month, scenario])
  return rows.length > 0
}

// Item do "pool" de rateio em memória (cascata). Intermediários não vão para
// actual_lines — só as linhas FINAIS são persistidas (relatório não muda).
type PoolItem = {
  value: number; supplier_id: string | null; category_id: string | null
  cost_class: string | null         // tratamento (OPEX/CAPEX/OTC) herdado da origem
  unit_id: string | null            // CC onde o valor está (null para INICIAL)
  tag: string                       // 'INICIAL' ou 'CAMADA:<n>'
  source_line_id: string | null     // actual_line de origem (para memória)
}
type Rule = {
  id: string; version: number; driver_id: string; supplier_id: string | null; category_id: string | null
  step_order: number; source_origin: string; source_unit_id: string | null
  driver_code: string; driver_kind: string
}

// F05 — aplica rateio ao Realizado POR CENTRO DE CUSTO (units), em CAMADAS.
// Camada 1 consome os custos RATEADO_ORIGEM; camadas seguintes consomem a saída
// da camada anterior ('CAMADA:<n>', casando pelo source_unit_id do hub).
// Persiste só as linhas FINAIS (RATEADO_ADM); grava a memória de cada pulo.
// step_order=1 + source_origin='INICIAL' reproduz o comportamento de passo único.
export async function applyRateioActual(year: number, month: number):
  Promise<{ sources: number; lines: number; skipped: number; closed?: boolean }> {
  if (await isPeriodClosed(year, month, 'ACTUAL')) return { sources: 0, lines: 0, skipped: 0, closed: true }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(`DELETE FROM public.actual_lines WHERE year=$1 AND month=$2 AND origin='RATEADO_ADM' AND source='rateio'`, [year, month])
    await client.query(`DELETE FROM public.rateio_results WHERE year=$1 AND month=$2 AND scenario='ACTUAL'`, [year, month])

    // regras ativas e vigentes, mais específicas primeiro (empata no step)
    const { rows: allRules } = await client.query(
      `SELECT rc.id, rc.version, rc.driver_id, rc.supplier_id, rc.category_id,
              rc.step_order, rc.source_origin, rc.source_unit_id,
              ad.code AS driver_code, ad.kind AS driver_kind
         FROM public.rateio_criteria rc JOIN public.allocation_drivers ad ON ad.id=rc.driver_id
        WHERE rc.status='ACTIVE' AND rc.apply_actual=true
          AND rc.valid_from <= make_date($1,$2,1)
          AND (rc.valid_to IS NULL OR rc.valid_to >= make_date($1,$2,1))
        ORDER BY rc.step_order,
                 (rc.category_id IS NOT NULL) DESC, (rc.supplier_id IS NOT NULL) DESC, rc.created_at DESC`,
      [year, month]) as { rows: Rule[] }

    const consumedTags = new Set(allRules.map(r => r.source_origin))
    const steps = [...new Set(allRules.map(r => r.step_order))].sort((a, b) => a - b)

    // pool inicial = custos a ratear
    const { rows: sources } = await client.query(
      `SELECT id, unit_id, category_id, supplier_id, value, cost_class::text AS cost_class FROM public.actual_lines
        WHERE year=$1 AND month=$2 AND origin='RATEADO_ORIGEM'`, [year, month])
    let poolItems: PoolItem[] = sources.map((s: any) => ({
      value: Number(s.value), supplier_id: s.supplier_id, category_id: s.category_id,
      cost_class: s.cost_class || null,
      unit_id: null, tag: 'INICIAL', source_line_id: s.id,
    }))

    // cache de alvos/bases por regra
    const targetsCache = new Map<string, { unit_id: string }[]>()
    async function targetsOf(rc: Rule): Promise<{ unit_id: string }[]> {
      if (targetsCache.has(rc.id)) return targetsCache.get(rc.id)!
      let pu = (await client.query(`SELECT unit_id FROM public.rateio_criteria_units WHERE criteria_id=$1`, [rc.id])).rows
      if (!pu.length) pu = (await client.query(`SELECT id AS unit_id FROM public.units WHERE is_active=true`)).rows
      targetsCache.set(rc.id, pu); return pu
    }
    async function driverData(rc: Rule) {
      const driverValues: Record<string, number> = {}, weights: Record<string, number> = {}
      if (rc.driver_kind === 'VALUE') {
        // Item A — base CONGELADA do budget: o realizado usa a base/% do cenário BUDGET
        // (mesma distribuição planejada). Só cai para ACTUAL se não houver base no budget.
        // Mantém herança por mês (usa o mês, ou o último mês anterior com base no ano).
        const eff = (sc: string) =>
          `SELECT unit_id, value FROM public.driver_values
             WHERE driver_id=$1 AND year=$2 AND scenario='${sc}'
               AND month = (SELECT max(month) FROM public.driver_values WHERE driver_id=$1 AND year=$2 AND scenario='${sc}' AND month <= $3)`
        let { rows } = await client.query(eff('BUDGET'), [rc.driver_id, year, month])
        if (!rows.length) rows = (await client.query(eff('ACTUAL'), [rc.driver_id, year, month])).rows
        for (const r of rows) driverValues[r.unit_id] = Number(r.value)
      } else if (rc.driver_kind === 'MANUAL' || rc.driver_kind === 'DIRECT') {
        const { rows } = await client.query(`SELECT unit_id, weight FROM public.rateio_unit_weights WHERE criteria_id=$1`, [rc.id])
        for (const r of rows) weights[r.unit_id] = Number(r.weight)
      }
      return { driverValues, weights }
    }
    const matchRule = (rulesS: Rule[], item: PoolItem): Rule | undefined =>
      rulesS.find(r => r.source_origin === item.tag && (
        item.tag === 'INICIAL'
          ? (r.supplier_id === item.supplier_id || r.supplier_id === null) && (r.category_id === item.category_id || r.category_id === null)
          : r.source_unit_id === item.unit_id))

    const finals: { unit_id: string; category_id: string | null; supplier_id: string | null; value: number; cost_class: string | null }[] = []
    let skipped = 0

    for (const S of steps) {
      const rulesS = allRules.filter(r => r.step_order === S)
      const outConsumed = consumedTags.has(`CAMADA:${S}`)   // alguma camada futura consome esta saída?
      const carry: PoolItem[] = []
      for (const item of poolItems) {
        const rc = matchRule(rulesS, item)
        if (!rc) { carry.push(item); continue }
        const pu = await targetsOf(rc)
        const { driverValues, weights } = await driverData(rc)
        const res = computeAllocation({ cost: item.value, driverKind: (rc.driver_kind || 'EQUAL'), units: pu.map(u => ({ unit_id: u.unit_id })), driverValues, weights })
        if (!res.lines.length) { skipped++; continue }
        for (const l of res.lines) {
          await client.query(
            `INSERT INTO public.rateio_results
               (criteria_id, source_line_id, unit_id, year, month, allocated, weight_pct,
                scenario, criteria_version, driver_code, driver_total, driver_unit_value, cost_total)
             VALUES($1,$2,$3,$4,$5,$6,$7,'ACTUAL',$8,$9,$10,$11,$12)`,
            [rc.id, item.source_line_id, l.unit_id, year, month, l.allocated, l.pct, rc.version, rc.driver_code, res.driver_total, l.driver_value, item.value])
          if (outConsumed) {
            carry.push({ value: l.allocated, supplier_id: item.supplier_id, category_id: item.category_id, cost_class: item.cost_class, unit_id: l.unit_id, tag: `CAMADA:${S}`, source_line_id: item.source_line_id })
          } else {
            finals.push({ unit_id: l.unit_id, category_id: item.category_id, supplier_id: item.supplier_id, value: l.allocated, cost_class: item.cost_class })
          }
        }
      }
      poolItems = carry
    }

    // sobras: INICIAL não casou → ignorado; intermediário sem consumidor → vira final
    for (const item of poolItems) {
      if (item.tag === 'INICIAL') skipped++
      else if (item.unit_id) finals.push({ unit_id: item.unit_id, category_id: item.category_id, supplier_id: item.supplier_id, value: item.value, cost_class: item.cost_class })
    }

    for (const f of finals) {
      await client.query(
        `INSERT INTO public.actual_lines(unit_id, category_id, supplier_id, year, month, value, origin, source, note, cost_class)
         VALUES($1,$2,$3,$4,$5,$6,'RATEADO_ADM','rateio','Rateio (F05)',$7)`,
        [f.unit_id, f.category_id, f.supplier_id, year, month, f.value, f.cost_class])
    }

    await client.query('COMMIT')
    return { sources: sources.length, lines: finals.length, skipped }
  } catch (e) { await client.query('ROLLBACK'); throw e }
  finally { client.release() }
}

// Rateio de BUDGET — distribui pelos CCs-alvo, gravando linhas source='rateio'.
// ANTI-DOBRA: se o fornecedor+categoria já tem budget carregado (upload/manual), o rateio
// CONSOME esse valor mês a mês (usa como origem e desativa as linhas de upload), em vez de
// somar por cima. Se não há budget carregado, gera a partir do budget_value/contrato da regra.
// Idempotente e reversível: a cada execução reativa o que havia neutralizado e recalcula.
// Usa a base/pesos do driver no cenário BUDGET (cai para ACTUAL se não houver base BUDGET).
export async function applyRateioBudget(year: number, createdBy: string | null):
  Promise<{ rules: number; lines: number; skipped: number; consumed: number }> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // Reset anti-dobra: reativa o upload que o rateio havia neutralizado (recomeça limpo).
    await client.query(
      `UPDATE public.budget_lines SET is_active=true, neutralized_by_rateio=false
        WHERE year=$1 AND neutralized_by_rateio=true`, [year])
    await client.query(`DELETE FROM public.budget_lines WHERE year=$1 AND source='rateio'`, [year])

    // Carrega TODAS as regras de budget ativas; o valor de cada uma é resolvido abaixo
    // (consumo do upload, ou budget_value/contrato quando não há upload).
    const { rows: rules } = await client.query(
      `SELECT rc.id, rc.driver_id, rc.category_id, rc.supplier_id,
              COALESCE(rc.budget_value, ct.monthly_value) AS budget_value,
              to_char(rc.valid_from,'YYYY-MM-DD') AS valid_from,
              to_char(rc.valid_to,'YYYY-MM-DD')   AS valid_to,
              ad.code AS driver_code, ad.kind AS driver_kind,
              ct.category_id AS service_category_id
         FROM public.rateio_criteria rc
         JOIN public.allocation_drivers ad ON ad.id=rc.driver_id
         LEFT JOIN public.contracts ct ON ct.id=rc.contract_id
        WHERE rc.status='ACTIVE' AND rc.apply_budget=true`)

    const verByKey = new Map<string, number>()
    const NIL = '00000000-0000-0000-0000-000000000000'
    let lines = 0, skipped = 0, consumed = 0

    for (const rc of rules) {
      const category_id = rc.category_id || rc.service_category_id
      if (!category_id) { skipped++; continue }     // budget_lines exige categoria

      let mFrom = 1, mTo = 12
      if (rc.valid_from) { const [y, m] = rc.valid_from.split('-').map(Number); if (y === year) mFrom = Math.max(1, m) }
      if (rc.valid_to)   { const [y, m] = rc.valid_to.split('-').map(Number); if (y === year) mTo = Math.min(12, m); else if (y < year) mTo = 0 }

      // Anti-dobra: budget já carregado para este fornecedor+categoria, por mês.
      // Só consome quando a regra tem fornecedor (evita capturar o budget de outros).
      const uploadByMonth: Record<number, number> = {}
      if (rc.supplier_id) {
        const { rows: ub } = await client.query(
          `SELECT month, SUM(value)::float AS v FROM public.budget_lines
            WHERE year=$1 AND is_active=true AND source<>'rateio'
              AND supplier_id=$2 AND category_id=$3
            GROUP BY month`, [year, rc.supplier_id, category_id])
        for (const r of ub) uploadByMonth[Number(r.month)] = Number(r.v)
      }
      const consumeMode = Object.keys(uploadByMonth).length > 0

      let pu = (await client.query(`SELECT unit_id FROM public.rateio_criteria_units WHERE criteria_id=$1`, [rc.id])).rows
      if (!pu.length) pu = (await client.query(`SELECT id AS unit_id FROM public.units WHERE is_active=true`)).rows

      for (let month = mFrom; month <= mTo; month++) {
        // valor a ratear no mês: o do upload (consome) ou o valor mensal da regra
        const monthValue = consumeMode ? (uploadByMonth[month] || 0) : Number(rc.budget_value || 0)
        if (!(monthValue > 0)) continue

        const driverValues: Record<string, number> = {}, weights: Record<string, number> = {}
        if (rc.driver_kind === 'VALUE') {
          // herança por mês (cenário BUDGET); se nada no ano, cai para ACTUAL (também com herança)
          const eff = (sc: string) =>
            `SELECT unit_id, value FROM public.driver_values
               WHERE driver_id=$1 AND year=$2 AND scenario='${sc}'
                 AND month = (SELECT max(month) FROM public.driver_values WHERE driver_id=$1 AND year=$2 AND scenario='${sc}' AND month <= $3)`
          let { rows } = await client.query(eff('BUDGET'), [rc.driver_id, year, month])
          if (!rows.length) rows = (await client.query(eff('ACTUAL'), [rc.driver_id, year, month])).rows
          for (const r of rows) driverValues[r.unit_id] = Number(r.value)
        } else if (rc.driver_kind === 'MANUAL' || rc.driver_kind === 'DIRECT') {
          const { rows } = await client.query(`SELECT unit_id, weight FROM public.rateio_unit_weights WHERE criteria_id=$1`, [rc.id])
          for (const r of rows) weights[r.unit_id] = Number(r.weight)
        }
        const res = computeAllocation({ cost: monthValue, driverKind: (rc.driver_kind || 'EQUAL'), units: pu.map((u: any) => ({ unit_id: u.unit_id })), driverValues, weights })
        if (!res.lines.length) { skipped++; continue }   // não distribuiu → NÃO neutraliza o upload (preserva o valor)

        // distribuiu com sucesso → neutraliza o upload deste mês (não conta em dobro)
        if (consumeMode && uploadByMonth[month] > 0) {
          const upd = await client.query(
            `UPDATE public.budget_lines SET is_active=false, neutralized_by_rateio=true
              WHERE year=$1 AND month=$2 AND is_active=true AND source<>'rateio'
                AND supplier_id=$3 AND category_id=$4`, [year, month, rc.supplier_id, category_id])
          consumed += upd.rowCount || 0
        }
        for (const l of res.lines) {
          const key = `${l.unit_id}|${category_id}|${rc.supplier_id || NIL}|${NIL}|${month}`
          const version = (verByKey.get(key) || 0) + 1; verByKey.set(key, version)
          await client.query(
            `INSERT INTO public.budget_lines
               (unit_id, category_id, supplier_id, year, month, value, version, is_active, uploaded_by, source, descricao)
             VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8,'rateio',$9)`,
            [l.unit_id, category_id, rc.supplier_id || null, year, month, l.allocated, version, createdBy, 'Rateio — ' + rc.driver_code])
          lines++
        }
      }
    }
    await client.query('COMMIT')
    return { rules: rules.length, lines, skipped, consumed }
  } catch (e) { await client.query('ROLLBACK'); throw e }
  finally { client.release() }
}

// Item 1 (gatilho) — decide se uma despesa realizada deve ser RATEADO_ORIGEM
// (custo central a distribuir). Carrega as regras INICIAL ativas/vigentes do período
// UMA vez e devolve um casador em memória (evita N consultas no loop de lançamento).
// Casa igual ao motor: (fornecedor casa OU regra sem fornecedor) E (categoria casa OU regra sem categoria).
export type ActualRuleMatcher = (supplier_id: string | null, category_id: string | null) => boolean
export async function loadActualRuleMatcher(
  q: { query: (sql: string, params: any[]) => Promise<{ rows: any[] }> },
  year: number, month: number,
): Promise<ActualRuleMatcher> {
  const { rows } = await q.query(
    `SELECT supplier_id, category_id FROM public.rateio_criteria
      WHERE status='ACTIVE' AND apply_actual=true AND source_origin='INICIAL'
        AND valid_from <= make_date($1,$2,1)
        AND (valid_to IS NULL OR valid_to >= make_date($1,$2,1))`,
    [year, month])
  return (sup, cat) => rows.some((r: any) =>
    (r.supplier_id === null || r.supplier_id === sup) &&
    (r.category_id === null || r.category_id === cat))
}
