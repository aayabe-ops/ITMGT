'use client'
import { useState } from 'react'
import { X, Check, ArrowRight, ArrowLeft, Sparkles } from 'lucide-react'
import { MONTHS_PT } from '@/lib/types'
import { yearOptions, DEFAULT_YEAR } from '@/lib/years'
import clsx from 'clsx'

interface Opt { id: string; code?: string; name: string; short_name?: string; supplier_id?: string; country_id?: string; kind?: string }
interface Props {
  suppliers: Opt[]; contracts: Opt[]; categories: Opt[]; countries: Opt[]; drivers: Opt[]; units: Opt[]
  editRule?: any | null
  onClose: () => void; onDone: () => void
}

const BRL = (n: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n || 0)

const STEPS = ['Fornecedor', 'Como dividir', 'Unidades', 'Números', 'Simular', 'Ativar']

// As 4 formas de rateio em linguagem de negócio
const FORMAS: { id: string; title: string; hint: string }[] = [
  { id: 'IGUAL', title: 'Igual entre as unidades', hint: 'Divide o custo em partes iguais entre as unidades marcadas. Não precisa de números.' },
  { id: 'QUANTIDADE', title: 'Por quantidade', hint: 'Você informa quanto cada unidade tem (nº de licenças, pessoas, aparelhos…). O custo divide proporcionalmente.' },
  { id: 'PERCENTUAL', title: 'Por percentual', hint: 'Você define o % de cada unidade (a soma deve dar 100%).' },
  { id: 'DIRETO', title: '100% numa unidade', hint: 'O custo vai inteiro para uma única unidade.' },
]

export default function RateioWizard({ suppliers, contracts, categories, countries, drivers, units, editRule, onClose, onDone }: Props) {
  const isEdit = !!editRule
  const [step, setStep] = useState(1)
  const [f, setF] = useState<any>(editRule ? {
    supplier_id: editRule.supplier_id || '', contract_id: editRule.contract_id || '', category_id: editRule.category_id || '',
    country_id: editRule.country_id || '', valid_from: editRule.valid_from || '', valid_to: editRule.valid_to || '',
    unit_ids: editRule.unit_ids || [],
  } : { supplier_id: '', contract_id: '', category_id: '', country_id: '', valid_from: '', valid_to: '', unit_ids: [] as string[] })
  const [forma, setForma] = useState<string>(editRule?.forma || '')
  const [year, setYear] = useState(DEFAULT_YEAR)
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [weights, setWeights] = useState<Record<string, string>>(() => {
    const w: Record<string, string> = {}
    for (const uw of (editRule?.unit_weights || [])) w[uw.unit_id] = String(uw.weight)
    return w
  })
  const [cost, setCost] = useState('')
  const [scenario, setScenario] = useState<'ACTUAL' | 'BUDGET' | 'BOTH'>(
    editRule ? (editRule.apply_budget && editRule.apply_actual ? 'BOTH' : editRule.apply_budget ? 'BUDGET' : 'ACTUAL') : 'ACTUAL')
  const [budgetValue, setBudgetValue] = useState(editRule?.budget_value != null ? String(editRule.budget_value) : '')
  const [criteriaId, setCriteriaId] = useState<string | null>(editRule?.id || null)
  const [draftCreated, setDraftCreated] = useState(false)
  const [sim, setSim] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [activated, setActivated] = useState(false)
  const [applied, setApplied] = useState('')

  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }))
  // forma → driver real (EQUAL / MANUAL / DIRECT)
  const idOfKind = (k: string) => drivers.find(d => d.kind === k)?.id || ''
  const driverIdOf = (fm: string) => fm === 'IGUAL' ? idOfKind('EQUAL') : fm === 'DIRETO' ? idOfKind('DIRECT') : idOfKind('MANUAL')
  const isDireto = forma === 'DIRETO'
  const needsNumbers = forma === 'QUANTIDADE' || forma === 'PERCENTUAL'

  const pu = units.filter(u => f.unit_ids.includes(u.id))
  const contractsForSupplier = contracts.filter(c => !f.supplier_id || c.supplier_id === f.supplier_id)
  const unitsForCountry = units.filter(u => !f.country_id || u.country_id === f.country_id)

  const toggleUnit = (id: string) => set('unit_ids', f.unit_ids.includes(id)
    ? f.unit_ids.filter((x: string) => x !== id)
    : (isDireto ? [id] : [...f.unit_ids, id]))

  const numTotal = pu.reduce((s, u) => s + (parseFloat((weights[u.id] || '').replace(',', '.')) || 0), 0)
  const pctValid = Math.abs(numTotal - 100) < 0.01

  const canNext = (() => {
    if (step === 1) return !!f.supplier_id
    if (step === 2) return !!forma
    if (step === 3) return isDireto ? f.unit_ids.length === 1 : f.unit_ids.length >= 1
    if (step === 4) {
      if (forma === 'QUANTIDADE') return numTotal > 0
      if (forma === 'PERCENTUAL') return pctValid
      return true // IGUAL / DIRETO
    }
    if (step === 5) return sim?.ok
    return true
  })()

  async function ensureRuleAndSimulate() {
    if (scenario !== 'ACTUAL' && !f.category_id) {
      setErr('Para ratear no Budget, selecione uma Categoria no passo 1 (o orçamento é por categoria).')
      setStep(1); return
    }
    if (!forma) { setErr('Escolha a forma de dividir (passo 2).'); setStep(2); return }
    setBusy(true); setErr('')
    try {
      const driver_id = driverIdOf(forma)
      const ruleBody = {
        supplier_id: f.supplier_id, contract_id: f.contract_id || null, category_id: f.category_id || null,
        country_id: f.country_id || null, driver_id, forma,
        valid_from: f.valid_from || null, valid_to: f.valid_to || null,
        apply_budget: scenario !== 'ACTUAL', apply_actual: scenario !== 'BUDGET',
        budget_value: (scenario !== 'ACTUAL' && !f.contract_id) ? (budgetValue || null) : null,
        status: isEdit ? (editRule.status || 'DRAFT') : 'DRAFT', unit_ids: f.unit_ids,
      }
      let cid = criteriaId
      if (isEdit) {
        const res = await fetch('/api/rateio', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: cid, ...ruleBody }) })
        const d = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(d.error || 'Falha ao atualizar a regra.')
      } else if (!cid) {
        const res = await fetch('/api/rateio', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ruleBody) })
        const d = await res.json().catch(() => ({}))
        if (!res.ok || !d.id) throw new Error(d.error || 'Falha ao criar a regra.')
        cid = d.id; setCriteriaId(cid); setDraftCreated(true)
      }
      // números por regra (quantidade/percentual) ou 100% na unidade (direto)
      if (needsNumbers || isDireto) {
        const unit_weights = isDireto
          ? [{ unit_id: f.unit_ids[0], weight: 100 }]
          : pu.map(u => ({ unit_id: u.id, weight: parseFloat((weights[u.id] || '').replace(',', '.')) || 0 }))
        const wr = await fetch('/api/rateio', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ criteria_id: cid, unit_weights, allow_any_sum: forma !== 'PERCENTUAL' }),
        })
        if (!wr.ok) { const wd = await wr.json().catch(() => ({})); throw new Error(wd.error || 'Falha ao salvar os números.') }
      }
      const rawCost = scenario === 'BUDGET' ? budgetValue : cost
      const c = parseFloat(String(rawCost).replace(/\./g, '').replace(',', '.'))
      if (!isFinite(c) || c <= 0) throw new Error(scenario === 'BUDGET' ? 'Informe o valor mensal do budget > 0.' : 'Informe um custo total > 0.')
      const sr = await fetch('/api/rateio/simulate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ criteria_id: cid, cost: c, year, month, scenario: scenario === 'BUDGET' ? 'BUDGET' : 'ACTUAL' }) })
      const sd = await sr.json().catch(() => ({}))
      if (!sr.ok) throw new Error(sd.error || 'Falha na simulação.')
      setSim(sd)
    } catch (e: any) { setErr(e?.message || 'Erro.') }
    finally { setBusy(false) }
  }

  async function activate() {
    if (!criteriaId) return
    setBusy(true); setErr('')
    try {
      const r = await fetch('/api/rateio', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: criteriaId, set_status: 'ACTIVE' }) })
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || 'Falha ao ativar.') }
      setActivated(true)
    } catch (e: any) { setErr(e?.message || 'Erro.') }
    finally { setBusy(false) }
  }

  async function applyNow() {
    setBusy(true); setErr('')
    try {
      const r = await fetch('/api/rateio/apply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ year, month, scenario }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Falha ao aplicar.')
      const parts: string[] = []
      if (d.actual) parts.push(`Realizado: ${d.actual.lines} linha(s)${d.actual.skipped ? ` (${d.actual.skipped} sem regra)` : ''}`)
      if (d.budget) parts.push(`Budget: ${d.budget.lines} linha(s)${d.budget.skipped ? ` (${d.budget.skipped} ignorada — sem categoria)` : ''}`)
      setApplied(`Rateio aplicado — ${parts.join(' · ') || 'ok'}.`)
    } catch (e: any) { setErr(e?.message || 'Erro.') }
    finally { setBusy(false) }
  }

  const next = () => { setErr(''); setStep(s => Math.min(6, s + 1)) }
  const back = () => { setErr(''); setStep(s => Math.max(1, s - 1)) }

  // No modo novo, trava o escopo depois de criar o rascunho; no modo edição, sempre editável.
  const scopeLocked = !isEdit && draftCreated

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="border-b border-slate-100 px-6 py-4">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-navy-800"><Sparkles className="h-4 w-4 text-bordeaux" /> {isEdit ? 'Editar rateio' : 'Assistente de Rateio'}</h3>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="h-5 w-5" /></button>
          </div>
          <div className="mt-3 flex items-center gap-1.5">
            {STEPS.map((s, i) => {
              const n = i + 1
              return (
                <div key={s} className="flex flex-1 items-center gap-1.5">
                  <span className={clsx('flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
                    n < step ? 'bg-emerald-500 text-white' : n === step ? 'bg-navy-800 text-white' : 'bg-slate-100 text-slate-400')}>
                    {n < step ? <Check className="h-3.5 w-3.5" /> : n}
                  </span>
                  <span className={clsx('hidden text-[11px] sm:block', n === step ? 'font-semibold text-navy-800' : 'text-slate-400')}>{s}</span>
                  {n < STEPS.length && <span className="h-px flex-1 bg-slate-100" />}
                </div>
              )
            })}
          </div>
        </div>

        <div className="flex-1 overflow-auto px-6 py-5">
          {/* 1 — Fornecedor & escopo */}
          {step === 1 && (
            <div className="space-y-4">
              <Intro title="Qual serviço será rateado?" text="O rateio é por serviço. Escolha o fornecedor e o serviço; categoria e valor vêm do próprio serviço. Deixe o serviço em branco só para uma regra que valha para todo o fornecedor." />
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Fornecedor *"><select className="input" disabled={scopeLocked} value={f.supplier_id} onChange={e => { set('supplier_id', e.target.value); set('contract_id', '') }}><option value="">Selecione…</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.short_name || s.name}</option>)}</select></Field>
                <Field label="Serviço"><select className="input" disabled={scopeLocked} value={f.contract_id} onChange={e => {
                  const cid = e.target.value; set('contract_id', cid)
                  const svc = contracts.find(c => c.id === cid) as any
                  if (svc?.category_id) set('category_id', svc.category_id)   // categoria vem do serviço
                  const mv = svc?.monthly_value
                  if (mv != null && Number(mv) > 0) { const v = Number(mv).toLocaleString('pt-BR', { minimumFractionDigits: 2 }); setCost(v); setBudgetValue(v) }
                }}><option value="">— (todo o fornecedor)</option>{contractsForSupplier.map(c => <option key={c.id} value={c.id}>{(c as any).monthly_value ? `${c.name} · R$ ${Number((c as any).monthly_value).toLocaleString('pt-BR')}/mês` : c.name}</option>)}</select></Field>
                <Field label="Categoria"><select className="input" disabled={scopeLocked} value={f.category_id} onChange={e => set('category_id', e.target.value)}><option value="">Todas</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
                <Field label="País"><select className="input" disabled={scopeLocked} value={f.country_id} onChange={e => { set('country_id', e.target.value); set('unit_ids', []) }}><option value="">Todos</option>{countries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
                <Field label="Vigência (de)"><input type="date" className="input" disabled={scopeLocked} value={f.valid_from} onChange={e => set('valid_from', e.target.value)} /></Field>
                <Field label="Até"><input type="date" className="input" disabled={scopeLocked} value={f.valid_to} onChange={e => set('valid_to', e.target.value)} /></Field>
              </div>
            </div>
          )}

          {/* 2 — Como dividir (4 formas) */}
          {step === 2 && (
            <div className="space-y-4">
              <Intro title="Como o custo será dividido?" text="Escolha a forma. Os números (se precisar) você informa no próximo passo, por unidade." />
              <div className="grid gap-2 sm:grid-cols-2">
                {FORMAS.map(fm => (
                  <button key={fm.id} type="button" disabled={scopeLocked} onClick={() => { setForma(fm.id); if (fm.id === 'DIRETO' && f.unit_ids.length > 1) set('unit_ids', []) }}
                    className={clsx('rounded-xl border p-3 text-left transition-colors', forma === fm.id ? 'border-navy-700 bg-navy-50' : 'border-slate-200 hover:border-slate-300', scopeLocked && 'opacity-60')}>
                    <span className="text-sm font-semibold text-slate-800">{fm.title}</span>
                    <p className="mt-1 text-xs text-slate-500">{fm.hint}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 3 — Unidades */}
          {step === 3 && (
            <div className="space-y-4">
              <Intro title="Quais unidades dividem o custo?" text={isDireto ? 'Selecione exatamente 1 unidade (recebe 100%).' : 'Marque as unidades (centros de custo) que fazem parte deste custo.'} />
              <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                {unitsForCountry.map(u => (
                  <button key={u.id} type="button" onClick={() => toggleUnit(u.id)}
                    className={clsx('rounded-lg border px-3 py-2 text-left text-sm transition-colors', f.unit_ids.includes(u.id) ? 'border-navy-700 bg-navy-50 text-navy-800' : 'border-slate-200 text-slate-600 hover:border-slate-300')}>
                    <span className="font-mono text-[10px] text-slate-400">{u.code}</span><br />{u.name}
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-400">{f.unit_ids.length} unidade(s) selecionada(s).</p>
            </div>
          )}

          {/* 4 — Números */}
          {step === 4 && (
            <div className="space-y-4">
              {forma === 'QUANTIDADE' && <>
                <Intro title="Informe a quantidade de cada unidade" text="Ex.: nº de licenças, pessoas, aparelhos. O custo divide proporcional a esses números." />
                <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                  {pu.map(u => (
                    <Field key={u.id} label={`${u.code} — ${u.name}`}><input className="input font-mono" placeholder="0" value={weights[u.id] || ''} onChange={e => setWeights(w => ({ ...w, [u.id]: e.target.value }))} /></Field>
                  ))}
                </div>
                <p className="text-sm text-slate-600">Total: <b className="font-mono">{numTotal.toLocaleString('pt-BR')}</b></p>
              </>}
              {forma === 'PERCENTUAL' && <>
                <Intro title="Defina o percentual de cada unidade" text="A soma deve dar 100%." />
                <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                  {pu.map(u => (
                    <Field key={u.id} label={`${u.code} — ${u.name} (%)`}><input type="number" step="0.01" min="0" max="100" className="input font-mono" placeholder="0,00" value={weights[u.id] || ''} onChange={e => setWeights(w => ({ ...w, [u.id]: e.target.value }))} /></Field>
                  ))}
                </div>
                <p className={clsx('text-sm', pctValid ? 'text-emerald-600' : 'text-red-600')}>Total: <b className="font-mono">{numTotal.toFixed(2)}%</b> {pctValid ? '✓' : '— deve somar 100%'}</p>
              </>}
              {forma === 'IGUAL' && <Intro title="Divisão igual" text="O custo é dividido em partes iguais entre as unidades marcadas — não precisa informar números. Pode avançar." />}
              {forma === 'DIRETO' && <Intro title="100% numa unidade" text="O custo vai inteiro para a unidade selecionada — não precisa informar números. Pode avançar." />}
            </div>
          )}

          {/* 5 — Simular */}
          {step === 5 && (
            <div className="space-y-4">
              <Intro title="Simule a distribuição" text="Escolha onde se aplica, informe o valor e confira antes de ativar." />
              <div className="flex flex-wrap items-end gap-3">
                <Field label="Aplicar em">
                  <select className="input h-9 w-44" value={scenario} onChange={e => { setScenario(e.target.value as any); setSim(null) }}>
                    <option value="ACTUAL">Realizado (mês)</option>
                    <option value="BUDGET">Budget (ano)</option>
                    <option value="BOTH">Ambos</option>
                  </select>
                </Field>
                {scenario !== 'BUDGET' && (
                  <Field label="Custo da fatura (R$)"><input className="input font-mono w-40" placeholder="0,00" value={cost} onChange={e => setCost(e.target.value)} /></Field>
                )}
                {scenario !== 'ACTUAL' && (
                  <Field label="Valor mensal do budget (R$)"><input className="input font-mono w-44" placeholder="0,00" value={budgetValue} onChange={e => setBudgetValue(e.target.value)} /></Field>
                )}
                <Field label="Mês"><select className="input h-9 w-32" value={month} onChange={e => setMonth(+e.target.value)}>{MONTHS_PT.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}</select></Field>
                <Field label="Ano"><select className="input h-9 w-24" value={year} onChange={e => setYear(+e.target.value)}>{yearOptions().map(y => <option key={y} value={y}>{y}</option>)}</select></Field>
                <button onClick={ensureRuleAndSimulate} className="btn-primary" disabled={busy}>{busy ? 'Calculando…' : 'Simular'}</button>
              </div>
              {scenario === 'BOTH' && <p className="text-[11px] text-slate-400">A prévia usa o <b>custo da fatura</b> (Realizado). O budget usa o valor mensal, com a mesma distribuição.</p>}
              {sim && (() => {
                const origem = Number(sim.cost ?? 0)
                const distribuido = Number(sim.reconciled ?? 0)
                const residuo = Math.round((origem - distribuido) * 100) / 100
                const zero = Math.abs(residuo) < 0.005
                return (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-lg bg-slate-50 px-3 py-2"><div className="text-[10px] uppercase tracking-wide text-slate-400">Origem</div><div className="font-mono font-semibold text-slate-800 tabular-nums text-sm mt-0.5">{BRL(origem)}</div></div>
                    <div className="rounded-lg bg-slate-50 px-3 py-2"><div className="text-[10px] uppercase tracking-wide text-slate-400">Distribuído</div><div className="font-mono font-semibold text-slate-800 tabular-nums text-sm mt-0.5">{BRL(distribuido)}</div></div>
                    <div className={clsx('rounded-lg px-3 py-2', zero ? 'bg-emerald-50' : 'bg-red-50')}><div className={clsx('text-[10px] uppercase tracking-wide', zero ? 'text-emerald-500' : 'text-red-400')}>Resíduo</div><div className={clsx('font-mono font-semibold tabular-nums text-sm mt-0.5', zero ? 'text-emerald-700' : 'text-red-600')}>{BRL(residuo)}</div></div>
                  </div>
                  <div className="overflow-hidden rounded-lg border border-slate-200">
                    <table className="tbl w-full text-sm">
                      <thead><tr className="bg-slate-50 text-[11px] uppercase text-slate-500"><th className="px-3 py-2 text-left">Unidade</th><th className="px-3 py-2 text-right">Número</th><th className="px-3 py-2 text-right">%</th><th className="px-3 py-2 text-right">Valor</th></tr></thead>
                      <tbody className="divide-y divide-slate-50">
                        {sim.lines.map((l: any) => <tr key={l.unit_id}><td className="px-3 py-1.5 text-xs text-slate-700">{l.code} — {l.name}</td><td className="px-3 py-1.5 text-right font-mono text-slate-500 tabular-nums">{Number(l.driver_value).toLocaleString('pt-BR')}</td><td className="px-3 py-1.5 text-right font-mono tabular-nums">{l.pct.toFixed(1)}%</td><td className="px-3 py-1.5 text-right font-mono text-slate-800 tabular-nums">{BRL(l.allocated)}</td></tr>)}
                      </tbody>
                      <tfoot><tr className="bg-slate-50 font-semibold text-slate-800"><td className="px-3 py-2 text-xs uppercase">Total</td><td /><td className="px-3 py-2 text-right">100%</td><td className={clsx('px-3 py-2 text-right font-mono tabular-nums', sim.ok ? 'text-emerald-600' : 'text-red-600')}>{BRL(sim.reconciled)}</td></tr></tfoot>
                    </table>
                    <div className={clsx('px-3 py-2 text-xs', sim.ok ? 'text-emerald-600' : 'text-red-600')}>{sim.ok ? '✓ Reconciliado — pode avançar.' : '⚠ Não reconciliou — revise os números.'}</div>
                  </div>
                </div>
                )
              })()}
            </div>
          )}

          {/* 6 — Ativar & aplicar */}
          {step === 6 && (
            <div className="space-y-4">
              <Intro title="Ativar e aplicar" text={scenario === 'BUDGET'
                ? 'Ative a regra e aplique no Budget do ano.'
                : scenario === 'BOTH' ? 'Ative e aplique no Realizado do mês e no Budget do ano.'
                  : 'Ative a regra. O Realizado é rateado automaticamente ao lançar a despesa; aqui você pode aplicar agora se quiser.'} />
              <div className="flex flex-wrap items-center gap-3">
                <button onClick={activate} className={clsx('btn-navy', activated && 'opacity-60')} disabled={busy || activated}>{activated ? '✓ Regra ativada' : 'Ativar regra'}</button>
                <button onClick={applyNow} className="btn-primary" disabled={busy || !activated}>
                  {scenario === 'BUDGET' ? `Aplicar no Budget (${year})` : scenario === 'BOTH' ? `Aplicar (Realizado ${MONTHS_PT[month - 1]}/${year} + Budget)` : `Aplicar no Realizado (${MONTHS_PT[month - 1]}/${year})`}
                </button>
              </div>
              {applied && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{applied}</p>}
            </div>
          )}

          {err && <p className="mt-4 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600">{err}</p>}
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 px-6 py-3">
          <button onClick={back} className="btn-secondary" disabled={step === 1 || busy}><ArrowLeft className="h-4 w-4" /> Voltar</button>
          {step < 6
            ? <button onClick={next} className="btn-primary" disabled={!canNext || busy}>Avançar <ArrowRight className="h-4 w-4" /></button>
            : <button onClick={onDone} className="btn-navy" disabled={busy}>Concluir</button>}
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="label">{label}</label>{children}</div>
}
function Intro({ title, text }: { title: string; text: string }) {
  return <div><h4 className="text-base font-semibold text-navy-800">{title}</h4><p className="mt-1 text-sm text-slate-500">{text}</p></div>
}
