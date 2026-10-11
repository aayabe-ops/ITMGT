import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser, canLancar } from '@/lib/auth'
import pool from '@/lib/db'
import { applyRateioActual, loadActualRuleMatcher, type ActualRuleMatcher } from '@/lib/rateioEngine'

const noauth = () => NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

// Resolve escopo (plataforma/país/unidade) respeitando as permissões do usuário.
async function resolveScope(user: any, sp: URLSearchParams) {
  let unitId = sp.get('unit_id') || null
  const unidadeId = sp.get('unidade_id') || null
  let countryId = sp.get('country_id') || null
  let platformId = sp.get('platform_id') || null
  let countryIds: string[] | null = null
  if (user.role !== 'admin' && user.role !== 'lancador') {
    const { rows: [sc] } = await pool.query('SELECT platform_id, country_id, unit_id FROM public.users WHERE id=$1', [user.id])
    const mc = (await pool.query('SELECT country_id FROM public.user_countries WHERE user_id=$1', [user.id])).rows.map((r: any) => r.country_id)
    if (mc.length) { countryIds = mc; unitId = null; countryId = null; platformId = null }
    else if (sc?.unit_id) { unitId = sc.unit_id; countryId = null; platformId = null }
    else if (sc?.country_id) { countryId = sc.country_id; platformId = null }
    else if (sc?.platform_id) { platformId = sc.platform_id }
    else return null // sem escopo → nada
  }
  return { unitId, unidadeId, countryId, platformId, countryIds }
}

export async function GET(req: NextRequest) {
  const user = getCurrentUser(); if (!user) return noauth()
  const sp = req.nextUrl.searchParams
  const year = parseInt(sp.get('year') || String(new Date().getFullYear()))
  const month = parseInt(sp.get('month') || String(new Date().getMonth() + 1)) // mês corrente por padrão
  const scope = await resolveScope(user, sp)
  if (scope === null) return NextResponse.json([])

  const params: any[] = [year, month]
  const conds: string[] = ['al.year = $1', 'al.month = $2']
  if (scope.unitId) { params.push(scope.unitId); conds.push(`al.unit_id = $${params.length}`) }
  if (scope.unidadeId) { params.push(scope.unidadeId); conds.push(`al.unit_id IN (SELECT id FROM public.units WHERE unidade_id = $${params.length})`) }
  if (scope.countryId) { params.push(scope.countryId); conds.push(`al.unit_id IN (SELECT id FROM public.units WHERE country_id = $${params.length})`) }
  if (scope.countryIds) { params.push(scope.countryIds); conds.push(`al.unit_id IN (SELECT id FROM public.units WHERE country_id = ANY($${params.length}::uuid[]))`) }
  if (scope.platformId) { params.push(scope.platformId); conds.push(`al.unit_id IN (SELECT u.id FROM public.units u JOIN public.countries c ON c.id=u.country_id WHERE c.platform_id = $${params.length})`) }

  const { rows } = await pool.query(`
    SELECT al.id, al.unit_id, al.category_id, al.supplier_id, al.year, al.month,
           al.value AS amount, al.note AS description, al.doc_ref AS invoice_ref,
           al.origin, al.payment_status, al.cost_class::text AS cost_class,
           u.code AS unit_code, ud.name AS unidade_nome, c.name AS category_name, COALESCE(s.short_name, s.name) AS supplier_name
    FROM public.actual_lines al
    LEFT JOIN public.units u ON u.id = al.unit_id
    LEFT JOIN public.unidades ud ON ud.id = u.unidade_id
    LEFT JOIN public.categories c ON c.id = al.category_id
    LEFT JOIN public.suppliers s ON s.id = al.supplier_id
    WHERE ${conds.join(' AND ')}
    ORDER BY al.created_at DESC`, params)
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const user = getCurrentUser(); if (!canLancar(user)) return noauth()
  const b: any = await req.json().catch(() => null)
  const rows: any[] = Array.isArray(b?.rows) ? b.rows : (b ? [b] : [])
  if (!rows.length) return NextResponse.json({ error: 'Nenhum lançamento.' }, { status: 400 })

  const client = await pool.connect()
  let ok = 0, err = 0; const errors: string[] = []
  // Item 1 — gatilho: despesa de fornecedor+categoria com regra ativa entra como
  // RATEADO_ORIGEM (custo central) e é distribuída automaticamente após o commit.
  const matchers = new Map<string, ActualRuleMatcher>()
  const touched = new Set<string>()             // `${year}|${month}` com origem a ratear
  async function matcherFor(y: number, m: number): Promise<ActualRuleMatcher> {
    const k = `${y}|${m}`
    if (!matchers.has(k)) matchers.set(k, await loadActualRuleMatcher(client, y, m))
    return matchers.get(k)!
  }
  // OPEX/CAPEX/OTC definido no LANÇAMENTO (linha); a categoria é só o padrão. Fornecedor NÃO define.
  const CC_SET = ['CAPEX', 'OPEX', 'OTC']
  const normCC = (v: any) => { const s = String(v || '').toUpperCase().trim(); return CC_SET.includes(s) ? s : null }
  const catCC: Record<string, string> = {}
  for (const x of (await pool.query('SELECT id, cost_class FROM public.categories WHERE cost_class IS NOT NULL')).rows) catCC[x.id] = x.cost_class
  const effCC = (r: any) => normCC(r.cost_class) || catCC[r.category_id] || null
  try {
    await client.query('BEGIN')
    for (const r of rows) {
      const val = Number(r.value ?? r.amount)
      const mo = parseInt(r.month)
      if (!r.unit_id || !r.category_id || !isFinite(val) || val < 0 || !(mo >= 1 && mo <= 12)) { err++; continue }
      const yr = parseInt(r.year) || new Date().getFullYear()
      const payStatus = String(r.payment_status || '').toUpperCase() === 'PAID' ? 'PAID' : 'ACCRUED'
      const match = await matcherFor(yr, mo)
      const origin = match(r.supplier_id || null, r.category_id) ? 'RATEADO_ORIGEM' : 'DIRETO'
      try {
        await client.query(
          `INSERT INTO public.actual_lines
             (unit_id, category_id, supplier_id, year, month, value, origin, source, doc_ref, note, currency_id, payment_status, paid_date, created_by, cost_class)
           VALUES ($1,$2,$3,$4,$5,$6,$12,'manual',$7,$8,
                   (SELECT c.currency_id FROM public.units u JOIN public.countries c ON c.id=u.country_id WHERE u.id=$1),
                   $9,$10,$11,$13)`,
          [r.unit_id, r.category_id, r.supplier_id || null, yr, mo, val,
           r.doc_ref ?? r.invoice_ref ?? null, r.note ?? r.description ?? null, payStatus, r.paid_date || null, user.id, origin, effCC(r)]
        )
        if (origin === 'RATEADO_ORIGEM') touched.add(`${yr}|${mo}`)
        ok++
      } catch (e: any) { err++; errors.push(e?.message || 'erro') }
    }
    await client.query('COMMIT')

    // Gatilho: distribui o realizado de cada período que recebeu custo central.
    let rateioLines = 0; const rateioClosed: string[] = []
    for (const key of touched) {
      const [y, m] = key.split('|').map(Number)
      try {
        const r = await applyRateioActual(y, m)
        if (r.closed) rateioClosed.push(`${String(m).padStart(2, '0')}/${y}`)
        else rateioLines += r.lines
      } catch { /* não falha o lançamento se o rateio tropeçar */ }
    }
    return NextResponse.json({
      saved: ok, errors: err, detail: errors.slice(0, 3),
      rateio: touched.size ? { lines: rateioLines, closed: rateioClosed } : null,
    })
  } catch (e: any) {
    await client.query('ROLLBACK')
    return NextResponse.json({ error: e?.message || 'Erro ao salvar.' }, { status: 500 })
  } finally { client.release() }
}

// PUT { id, payment_status:'PAID'|'ACCRUED' } — marca/desmarca pago na ordem de pagamento.
// Ao marcar pago, carimba paid_date (hoje) se ainda não houver; ao voltar a pendente, limpa.
export async function PUT(req: NextRequest) {
  const user = getCurrentUser(); if (!canLancar(user)) return noauth()
  const b: any = await req.json().catch(() => null)
  const id = b?.id
  if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 })
  const status = String(b?.payment_status || '').toUpperCase() === 'PAID' ? 'PAID' : 'ACCRUED'
  await pool.query(
    `UPDATE public.actual_lines
        SET payment_status=$2,
            paid_date = CASE WHEN $2='PAID' THEN COALESCE(paid_date, CURRENT_DATE) ELSE NULL END
      WHERE id=$1`,
    [id, status])
  return NextResponse.json({ ok: true, payment_status: status })
}

export async function DELETE(req: NextRequest) {
  const user = getCurrentUser(); if (!canLancar(user)) return noauth()
  const b: any = await req.json().catch(() => null)
  const id = b?.id || new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 })
  await pool.query('DELETE FROM public.actual_lines WHERE id=$1', [id])
  return NextResponse.json({ ok: true })
}
