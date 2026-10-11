import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser, canLancar } from '@/lib/auth'
import pool from '@/lib/db'
import { applyRateioActual, loadActualRuleMatcher, type ActualRuleMatcher } from '@/lib/rateioEngine'

// Importa lançamentos de Realizado (CSV já resolvido pelo cliente) e registra o lote.
// body: { country_id, unit_id?, scope:'UNIT'|'COUNTRY_FULL', year, month, filename,
//         rows:[{unit_id, category_id, supplier_id?, value, month?, project_id?, cost_class?, doc_ref?, note?}] }
export async function POST(req: NextRequest) {
  const user = getCurrentUser()
  if (!canLancar(user)) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const b: any = await req.json().catch(() => null)
  if (!b || !Array.isArray(b.rows) || b.rows.length === 0) {
    return NextResponse.json({ error: 'Nenhuma linha para importar.' }, { status: 400 })
  }
  const year = parseInt(b.year)
  const month = parseInt(b.month)
  const scope = b.scope === 'COUNTRY_FULL' ? 'COUNTRY_FULL' : 'UNIT'
  if (!(year > 0) || !(month >= 1 && month <= 12)) {
    return NextResponse.json({ error: 'Ano/mês inválidos.' }, { status: 400 })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const { rows: [batch] } = await client.query(
      `INSERT INTO public.actual_upload_batches
         (filename, country_id, unit_id, scope, year, month, rows_total, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [b.filename || null, b.country_id || null, scope === 'UNIT' ? (b.unit_id || null) : null, scope, year, month, b.rows.length, user.id]
    )

    // Incremental por mês: re-subir substitui apenas as (unidades × meses) deste arquivo,
    // sem afetar os demais meses/unidades. Só remove lançamentos de origem 'upload' (mantém rateio).
    const unitIds = [...new Set(b.rows.map((r: any) => r.unit_id).filter(Boolean))]
    const months = [...new Set(b.rows.map((r: any) => parseInt(r.month) || month).filter((m: number) => m >= 1 && m <= 12))]
    if (unitIds.length && months.length) {
      await client.query(
        `DELETE FROM public.actual_lines
          WHERE source='upload' AND year=$1 AND month = ANY($2::int[]) AND unit_id = ANY($3::uuid[])`,
        [year, months, unitIds]
      )
    }

    // F2: moeda do realizado = moeda do país do lote
    let currencyId: string | null = null
    if (b.country_id) {
      const { rows: [cc] } = await client.query('SELECT currency_id FROM public.countries WHERE id=$1', [b.country_id])
      currencyId = cc?.currency_id || null
    }

    // Item 1 — gatilho: fornecedor+categoria com regra ativa entra como RATEADO_ORIGEM
    // (custo central) e é distribuído após o commit. Carrega o casador por mês uma vez.
    const matchers = new Map<number, ActualRuleMatcher>()
    const touched = new Set<number>()
    async function matcherFor(m: number): Promise<ActualRuleMatcher> {
      if (!matchers.has(m)) matchers.set(m, await loadActualRuleMatcher(client, year, m))
      return matchers.get(m)!
    }
    // OPEX/CAPEX/OTC definido no LANÇAMENTO (linha); a categoria é só o padrão. Fornecedor NÃO define.
    const CC_SET = ['CAPEX', 'OPEX', 'OTC']
    const normCC = (v: any) => { const s = String(v || '').toUpperCase().trim(); return CC_SET.includes(s) ? s : null }
    const catCC: Record<string, string> = {}
    for (const x of (await client.query('SELECT id, cost_class FROM public.categories WHERE cost_class IS NOT NULL')).rows) catCC[x.id] = x.cost_class
    const effCC = (r: any) => normCC(r.cost_class) || catCC[r.category_id] || null

    let ok = 0, err = 0
    for (const r of b.rows) {
      const mo = parseInt(r.month) || month
      const val = Number(r.value)
      if (!r.unit_id || !r.category_id || !isFinite(val) || val < 0 || !(mo >= 1 && mo <= 12)) { err++; continue }
      const payStatus = String(r.payment_status || '').toUpperCase() === 'PAID' ? 'PAID' : 'ACCRUED'
      const match = await matcherFor(mo)
      const origin = match(r.supplier_id || null, r.category_id) ? 'RATEADO_ORIGEM' : 'DIRETO'
      try {
        await client.query(
          `INSERT INTO public.actual_lines
             (unit_id, category_id, supplier_id, year, month, value, origin, source, doc_ref, note, cost_class, project_id, currency_id, payment_status, paid_date, created_by, upload_batch_id)
           VALUES ($1,$2,$3,$4,$5,$6,$16,'upload',$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
          [r.unit_id, r.category_id, r.supplier_id || null, parseInt(r.year) || year, mo, val,
           r.doc_ref || null, r.note || null, effCC(r), r.project_id || null,
           currencyId, payStatus, r.paid_date || null, user.id, batch.id, origin]
        )
        if (origin === 'RATEADO_ORIGEM') touched.add(mo)
        ok++
      } catch { err++ }
    }

    const status = ok > 0 ? 'CONCLUIDO' : 'ERRO'
    await client.query(
      `UPDATE public.actual_upload_batches SET rows_ok=$1, rows_err=$2, status=$3 WHERE id=$4`,
      [ok, err, status, batch.id]
    )
    await client.query('COMMIT')

    // Gatilho: distribui o realizado de cada mês que recebeu custo central.
    let rateioLines = 0; const rateioClosed: string[] = []
    for (const m of touched) {
      try {
        const rr = await applyRateioActual(year, m)
        if (rr.closed) rateioClosed.push(`${String(m).padStart(2, '0')}/${year}`)
        else rateioLines += rr.lines
      } catch { /* não falha a importação se o rateio tropeçar */ }
    }
    return NextResponse.json({
      saved: ok, errors: err, batch_id: batch.id,
      rateio: touched.size ? { lines: rateioLines, closed: rateioClosed } : null,
    })
  } catch (e: any) {
    await client.query('ROLLBACK')
    return NextResponse.json({ error: e?.message || 'Erro ao importar.' }, { status: 500 })
  } finally {
    client.release()
  }
}
