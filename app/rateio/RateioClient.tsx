'use client'
import { useState, useEffect, useCallback, Fragment } from 'react'
import { Plus, ToggleLeft, ToggleRight, RefreshCw, X, PlayCircle, Sparkles, FileSpreadsheet, SlidersHorizontal, Gauge, Pencil } from 'lucide-react'
import Link from 'next/link'
import { MONTHS_PT } from '@/lib/types'
import { yearOptions, DEFAULT_YEAR } from '@/lib/years'
import clsx from 'clsx'
import RateioWizard from './RateioWizard'

interface Opt { id: string; code?: string; name: string; short_name?: string; supplier_id?: string; country_id?: string; kind?: string; metric?: string | null; unit_label?: string | null; unidade_id?: string | null; unidade_nome?: string }
interface Props {
  categories: Opt[]; suppliers: Opt[]; units: Opt[]
  drivers: Opt[]; contracts: Opt[]; countries: Opt[]
}
interface Rule {
  id: string; supplier_id: string; contract_id: string | null; category_id: string | null
  country_id: string | null; driver_id: string; version: number; status: string; is_active: boolean
  apply_budget: boolean; apply_actual: boolean; valid_from: string | null; valid_to: string | null
  supplier_name: string; supplier_short_name: string | null; contract_name: string | null
  category_name: string | null; country_name: string | null
  driver_code: string; driver_name: string; driver_kind: string; driver_unit?: string | null
  unit_ids: string[]; weights_sum?: number; base_units?: number | null
  step_order?: number; source_origin?: string; source_unit_id?: string | null; budget_value?: number | string | null
}
type Tab = 'criteria' | 'bases' | 'weights' | 'apply' | 'resumo'

const emptyForm = {
  supplier_id: '', contract_id: '', category_id: '', country_id: '', driver_id: '',
  valid_from: '', valid_to: '', apply_budget: false, apply_actual: true, status: 'DRAFT',
  unit_ids: [] as string[],
  step_order: 1, source_origin: 'INICIAL', source_unit_id: '',
  budget_value: '',
}

const statusBadge = (s: string) =>
  s === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' : s === 'DRAFT' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'
const BRL = (n: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n || 0)

// Selo de prontidão: o que falta para a regra render rateio corretamente.
function readiness(r: Rule): { label: string; cls: string } {
  if (r.status === 'INACTIVE') return { label: '⚪ Inativa', cls: 'bg-slate-100 text-slate-500' }
  if (r.status !== 'ACTIVE') return { label: '🟡 Rascunho', cls: 'bg-amber-50 text-amber-700' }
  if (r.driver_kind === 'MANUAL' && Math.abs((Number(r.weights_sum) || 0) - 100) > 0.01)
    return { label: '🟠 Pesos ≠ 100%', cls: 'bg-orange-50 text-orange-700' }
  if (r.driver_kind === 'VALUE' && !(Number(r.base_units) > 0))
    return { label: '🟠 Sem base', cls: 'bg-orange-50 text-orange-700' }
  if (!(r.unit_ids || []).length) return { label: '🟠 Sem centros de custo', cls: 'bg-orange-50 text-orange-700' }
  return { label: '🟢 Pronta', cls: 'bg-emerald-50 text-emerald-700' }
}

// Chip de base do driver (só faz sentido em driver "por valor")
function baseChip(r: Rule): { label: string; cls: string } | null {
  if (r.driver_kind !== 'VALUE') return null
  const n = Number(r.base_units) || 0
  return n > 0
    ? { label: `🟢 base: ${n} CC${n > 1 ? 's' : ''}`, cls: 'bg-emerald-50 text-emerald-700' }
    : { label: '🟠 sem base', cls: 'bg-orange-50 text-orange-700' }
}

export default function RateioClient({ categories, suppliers, units, drivers, contracts, countries }: Props) {
  const [tab, setTab] = useState<Tab>('criteria')
  const [rows, setRows] = useState<Rule[]>([])
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [showWizard, setShowWizard] = useState(false)
  const [editRule, setEditRule] = useState<Rule | null>(null)
  const [form, setForm] = useState<any>({ ...emptyForm })
  const [saving, setSaving] = useState(false)

  // pesos
  const [wCriteriaId, setWCriteriaId] = useState('')
  const [weights, setWeights] = useState<Record<string, string>>({})
  const [wSaving, setWSaving] = useState(false)

  // bases dos drivers — por UNIDADE: valor único, dividido entre os CCs da unidade e replicado nos 12 meses
  const [bDriverId, setBDriverId] = useState('')
  const [bYear, setBYear] = useState(DEFAULT_YEAR)
  const [bScenario, setBScenario] = useState<'ACTUAL' | 'BUDGET'>('ACTUAL')
  const [bUniVals, setBUniVals] = useState<Record<string, string>>({})
  const [bChecked, setBChecked] = useState<Record<string, boolean>>({})
  const [bQ, setBQ] = useState('')
  const [bSaving, setBSaving] = useState(false)
  const [bLoading, setBLoading] = useState(false)

  // Unidades com CCs ativos (os CCs sem unidade viram aviso, não entram na lista)
  const bUnidades = (() => {
    const m = new Map<string, { id: string; nome: string; ccs: Opt[] }>()
    for (const u of units) {
      if (!u.unidade_id) continue
      const e = m.get(u.unidade_id) || { id: u.unidade_id, nome: u.unidade_nome || 'Sem nome', ccs: [] as Opt[] }
      e.ccs.push(u); m.set(u.unidade_id, e)
    }
    return Array.from(m.values()).sort((a, b) => a.nome.localeCompare(b.nome))
  })()
  const bOrphans = units.filter(u => !u.unidade_id).length
  const bUnidadesShown = (() => {
    const t = bQ.trim().toLowerCase()
    if (!t) return bUnidades
    return bUnidades.filter(x => x.nome.toLowerCase().includes(t) || x.ccs.some(c => (c.code || '').toLowerCase().includes(t)))
  })()

  const loadBase = useCallback(async () => {
    if (!bDriverId) { setBUniVals({}); setBChecked({}); return }
    setBLoading(true)
    const p = new URLSearchParams({ driver_id: bDriverId, year: String(bYear), scenario: bScenario, all: '1' })
    const res = await fetch(`/api/driver-values?${p}`); const data = await res.json().catch(() => ({}))
    // valor por CC = o do menor mês presente (após salvar, os 12 meses são iguais)
    const byCc: Record<string, { m: number; v: number }> = {}
    for (const r of (data?.rows || [])) {
      const mo = Number(r.month), v = Number(r.value)
      if (!byCc[r.unit_id] || mo < byCc[r.unit_id].m) byCc[r.unit_id] = { m: mo, v }
    }
    const vals: Record<string, string> = {}, chk: Record<string, boolean> = {}
    for (const un of bUnidades) {
      const sum = un.ccs.reduce((s, c) => s + (byCc[c.id]?.v || 0), 0)
      if (sum > 0) { vals[un.id] = String(Number(sum.toFixed(3))); chk[un.id] = true }
    }
    setBUniVals(vals); setBChecked(chk); setBLoading(false)
  }, [bDriverId, bYear, bScenario])   // bUnidades deriva de `units` (prop estável)
  useEffect(() => { loadBase() }, [loadBase])

  function toggleAll(on: boolean) {
    setBChecked(c => { const n = { ...c }; for (const un of bUnidadesShown) n[un.id] = on; return n })
  }

  async function saveBase() {
    if (!bDriverId) { setMsg('Erro: selecione o driver.'); return }
    const sel = bUnidades.filter(un => bChecked[un.id])
    if (!sel.length) { setMsg('Marque ao menos uma unidade.'); return }
    setBSaving(true); setMsg('')
    const values: { unit_id: string; month: number; value: number }[] = []
    for (const un of sel) {
      const V = parseFloat((bUniVals[un.id] || '').replace(',', '.')) || 0
      const perCC = un.ccs.length ? V / un.ccs.length : 0   // divide entre os CCs
      for (const c of un.ccs) for (let m = 1; m <= 12; m++) values.push({ unit_id: c.id, month: m, value: perCC })
    }
    const res = await fetch('/api/driver-values', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ driver_id: bDriverId, year: bYear, scenario: bScenario, values }) })
    const d = await res.json().catch(() => ({}))
    setMsg(res.ok ? `Base salva — ${sel.length} unidade(s), aplicada aos 12 meses.` : (d.error || 'Erro ao salvar base.'))
    setBSaving(false)
    if (res.ok) loadBase()
  }

  // simulação (F04)
  const [sim, setSim] = useState<any>(null)
  const openSim = (rule: Rule) => setSim({ rule, cost: '', year: DEFAULT_YEAR, month: new Date().getMonth() + 1, scenario: 'ACTUAL', result: null, loading: false, err: '' })
  async function calcSim() {
    const cost = parseFloat(String(sim.cost).replace(/\./g, '').replace(',', '.'))
    if (!isFinite(cost) || cost <= 0) { setSim((s: any) => ({ ...s, err: 'Informe um custo > 0.' })); return }
    setSim((s: any) => ({ ...s, loading: true, err: '' }))
    const res = await fetch('/api/rateio/simulate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ criteria_id: sim.rule.id, cost, year: sim.year, month: sim.month, scenario: sim.scenario }),
    })
    const d = await res.json().catch(() => ({}))
    setSim((s: any) => ({ ...s, loading: false, result: res.ok ? d : null, err: res.ok ? '' : (d.error || 'Erro na simulação.') }))
  }

  // aplicação & memória — aplicar BUDGET (deliberado) + memória de auditoria do realizado.
  // O rateio do realizado é automático (gatilho) e finalizado no Fechamento (/closing).
  const [aYear, setAYear] = useState(DEFAULT_YEAR)
  const [aMonth, setAMonth] = useState(new Date().getMonth() + 1)
  const [aApplying, setAApplying] = useState(false)
  const [memory, setMemory] = useState<any[]>([])
  const [closed, setClosed] = useState(false)   // só informativo (o fechar/reabrir mora no /closing)
  const loadMemory = useCallback(async () => {
    const p = new URLSearchParams({ year: String(aYear), month: String(aMonth), scenario: 'ACTUAL' })
    const [m, cp] = await Promise.all([
      fetch(`/api/rateio/memory?${p}`).then(r => r.json()).catch(() => []),
      fetch(`/api/closed-periods?year=${aYear}`).then(r => r.json()).catch(() => []),
    ])
    setMemory(Array.isArray(m) ? m : [])
    setClosed(Array.isArray(cp) && cp.some((x: any) => x.month === aMonth && (x.scenario === 'ALL' || x.scenario === 'ACTUAL')))
  }, [aYear, aMonth])
  useEffect(() => { if (tab === 'apply') loadMemory() }, [tab, loadMemory])
  async function applyBudget() {
    setAApplying(true); setMsg('')
    const res = await fetch('/api/rateio/apply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ year: aYear, scenario: 'BUDGET' }) })
    const d = await res.json().catch(() => ({}))
    if (res.ok && d.budget) {
      setMsg(`Budget rateado — ${d.budget.lines} linha(s) de ${d.budget.rules} regra(s)${d.budget.consumed ? `, ${d.budget.consumed} do upload consumida(s) (sem dobra)` : ''}${d.budget.skipped ? `, ${d.budget.skipped} ignorada(s)` : ''}.`)
    } else setMsg(d.error || 'Erro ao aplicar.')
    setAApplying(false); loadMemory()
  }

  // Resumo por unidade / % da empresa (relatório)
  const [rYear, setRYear] = useState(DEFAULT_YEAR)
  const [rMonth, setRMonth] = useState(0) // 0 = ano todo
  const [rScenario, setRScenario] = useState<'ACTUAL' | 'BUDGET'>('ACTUAL')
  const [resumo, setResumo] = useState<any[]>([])
  const loadResumo = useCallback(async () => {
    const p = new URLSearchParams({ year: String(rYear), month: String(rMonth), scenario: rScenario })
    const d = await fetch(`/api/rateio/resumo?${p}`).then(r => r.json()).catch(() => [])
    setResumo(Array.isArray(d) ? d : [])
  }, [rYear, rMonth, rScenario])
  useEffect(() => { if (tab === 'resumo') loadResumo() }, [tab, loadResumo])
  const resumoGroups = (() => {
    const g: Record<string, { rows: any[]; total: number }> = {}
    for (const r of resumo) { (g[r.empresa_name] ||= { rows: [], total: 0 }); g[r.empresa_name].rows.push(r); g[r.empresa_name].total += Number(r.total) || 0 }
    return g
  })()
  const resumoGrand = resumo.reduce((s, r) => s + (Number(r.total) || 0), 0)

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))
  const driverById = (id: string) => drivers.find(d => d.id === id)
  const unitById = (id: string) => units.find(u => u.id === id)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/rateio'); const data = await res.json()
    setRows(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const contractsForSupplier = contracts.filter(c => !form.supplier_id || c.supplier_id === form.supplier_id)
  const unitsForCountry = units.filter(u => !form.country_id || u.country_id === form.country_id)
  const selDriver = driverById(form.driver_id)
  const toggleUnit = (id: string) => set('unit_ids', form.unit_ids.includes(id) ? form.unit_ids.filter((x: string) => x !== id) : [...form.unit_ids, id])
  const reset = () => { setForm({ ...emptyForm }); setMsg('') }

  // carrega uma regra no formulário para edição
  // Editar agora abre o ASSISTENTE (mesmo fluxo simples de criar), pré-preenchido.
  function openEdit(r: Rule) { setEditRule(r); setShowWizard(true); setMsg('') }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!form.supplier_id || !form.driver_id) { setMsg('Erro: Fornecedor e Driver são obrigatórios.'); return }
    setSaving(true); setMsg('')
    const res = await fetch('/api/rateio', {
      method: form.id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(form.id ? { id: form.id } : {}),
        supplier_id: form.supplier_id, contract_id: form.contract_id || null,
        category_id: form.category_id || null, country_id: form.country_id || null,
        driver_id: form.driver_id, valid_from: form.valid_from || null, valid_to: form.valid_to || null,
        apply_budget: form.apply_budget, apply_actual: form.apply_actual, status: form.status,
        unit_ids: form.unit_ids,
        step_order: form.step_order, source_origin: form.source_origin,
        source_unit_id: form.source_origin === 'INICIAL' ? null : (form.source_unit_id || null),
        budget_value: form.apply_budget ? (form.budget_value || null) : null,
      }),
    })
    const wasEdit = !!form.id
    const d = await res.json().catch(() => ({}))
    if (res.ok) { reset(); await load(); setMsg(wasEdit ? 'Regra atualizada.' : 'Regra salva.') }
    else setMsg(d.error || 'Erro ao salvar.')
    setSaving(false)
  }

  async function handleToggle(id: string) {
    await fetch('/api/rateio/toggle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    await load()
  }

  const manualRules = rows.filter(r => r.driver_kind === 'MANUAL')
  const wRule = rows.find(r => r.id === wCriteriaId)
  const wUnits = wRule && wRule.unit_ids && wRule.unit_ids.length ? units.filter(u => wRule.unit_ids!.includes(u.id)) : units
  const wTotal = wUnits.reduce((s, u) => s + (parseFloat(weights[u.id] || '0') || 0), 0)
  const wValid = Math.abs(wTotal - 100) < 0.01
  async function handleWeightSave(e: React.FormEvent) {
    e.preventDefault()
    if (!wCriteriaId) return
    if (!wValid) { setMsg(`Erro: os percentuais devem somar 100% (atual: ${wTotal.toFixed(2)}%).`); return }
    setWSaving(true); setMsg('')
    const unit_weights = wUnits.map(u => ({ unit_id: u.id, weight: parseFloat(weights[u.id] || '0') || 0 }))
    const res = await fetch('/api/rateio', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ criteria_id: wCriteriaId, unit_weights }) })
    const d = await res.json().catch(() => ({}))
    setMsg(res.ok ? 'Pesos salvos.' : (d.error || 'Erro ao salvar pesos.'))
    setWSaving(false)
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Rateio</h1>
          <p className="page-sub">Defina a <b>premissa</b> de cada serviço — uma vez por ano. Ela congela e o realizado segue sozinho.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/rateio/excecoes" className="btn-secondary flex items-center gap-1.5"><SlidersHorizontal className="w-4 h-4" /> Custos sem premissa</Link>
          <Link href="/rateio/drivers" className="btn-secondary flex items-center gap-1.5" title="Avançado — métricas reutilizáveis (headcount, nº de máquinas, horas)"><Gauge className="w-4 h-4" /> Medidas compartilhadas</Link>
          <Link href="/rateio/import" className="btn-secondary flex items-center gap-1.5"><FileSpreadsheet className="w-4 h-4" /> Importar Excel</Link>
          <button onClick={load} className="btn-secondary" disabled={loading}><RefreshCw className={clsx('w-4 h-4', loading && 'animate-spin')} /></button>
        </div>
      </div>

      {/* Hero — o assistente é o caminho recomendado */}
      <div className="card p-4 md:p-5 mb-6 bg-gradient-to-br from-navy-800 to-navy-900 border-0">
        <div className="flex items-center justify-between gap-6 flex-wrap">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-blue-200/90">Premissa de rateio</div>
            <h2 className="text-xl font-bold mt-1 text-white">Defina como um serviço se divide — vale o ano todo</h2>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-3 text-[12px] text-slate-200">
              {['O quê', 'Como', 'Quem', 'Confira', 'Aplique'].map((s, i) => (
                <span key={s} className="inline-flex items-center gap-2">
                  {i > 0 && <span className="text-slate-400/60">›</span>}
                  <span className="inline-flex items-center gap-1.5"><span className="w-5 h-5 rounded-md bg-white/20 text-white text-[11px] font-bold flex items-center justify-center">{i + 1}</span>{s}</span>
                </span>
              ))}
            </div>
          </div>
          <button onClick={() => { setEditRule(null); setShowWizard(true) }} className="shrink-0 inline-flex items-center gap-2 rounded-lg bg-bordeaux-600 text-white px-6 py-3 text-base font-semibold hover:bg-bordeaux-700 transition-colors shadow-lg shadow-bordeaux-900/30 ring-1 ring-white/10">
            <Sparkles className="w-5 h-5" /> Nova premissa
          </button>
        </div>
      </div>

      {showWizard && (
        <RateioWizard
          suppliers={suppliers} contracts={contracts} categories={categories}
          countries={countries} drivers={drivers} units={units}
          editRule={editRule}
          onClose={() => { setShowWizard(false); setEditRule(null) }}
          onDone={() => { setShowWizard(false); setEditRule(null); load() }}
        />
      )}

      <div className="flex items-center justify-between mb-2">
        <span className="eyebrow">Avançado (técnico) — regras, medidas compartilhadas, pesos e aplicação</span>
      </div>
      <div className="flex gap-1 mb-6 border-b border-slate-100 overflow-x-auto">
        {(['criteria', 'bases', 'weights', 'apply', 'resumo'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={clsx('px-4 py-2 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap',
              tab === t ? 'bg-white border border-b-white border-slate-100 text-blue-600 -mb-px' : 'text-slate-500 hover:text-slate-700')}>
            {t === 'criteria' ? 'Regras' : t === 'bases' ? 'Medida compartilhada' : t === 'weights' ? 'Pesos Manuais' : t === 'apply' ? 'Aplicação & Memória' : 'Resumo por unidade'}
          </button>
        ))}
      </div>

      {msg && <div className={clsx('mb-4 px-4 py-2 rounded-lg text-sm', msg.includes('Erro') ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700')}>{msg}</div>}

      {tab === 'criteria' && (
        <>
          <form onSubmit={handleAdd} className={clsx('card p-5 mb-6', form.id && 'ring-1 ring-blue-200')}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-slate-700">{form.id ? '✏️ Editar regra' : 'Novo Critério'}</p>
              {form.id && <button type="button" onClick={reset} className="text-xs text-slate-400 hover:text-slate-600">Cancelar edição</button>}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div><label className="label">Fornecedor *</label>
                <select className="input" value={form.supplier_id} onChange={e => { set('supplier_id', e.target.value); set('contract_id', '') }} required>
                  <option value="">Selecione…</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.short_name || s.name}</option>)}
                </select>
              </div>
              <div><label className="label">Contrato / Serviço</label>
                <select className="input" value={form.contract_id} onChange={e => set('contract_id', e.target.value)}>
                  <option value="">— (todo o fornecedor)</option>
                  {contractsForSupplier.map(c => <option key={c.id} value={c.id}>{c.code ? `${c.code} — ` : ''}{c.name}</option>)}
                </select>
              </div>
              <div><label className="label">Categoria</label>
                <select className="input" value={form.category_id} onChange={e => set('category_id', e.target.value)}>
                  <option value="">Todas</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div><label className="label">Driver *</label>
                <select className="input" value={form.driver_id} onChange={e => set('driver_id', e.target.value)} required>
                  <option value="">Selecione…</option>
                  {drivers.map(d => <option key={d.id} value={d.id}>{d.name} ({d.kind})</option>)}
                </select>
              </div>
              <div><label className="label">País</label>
                <select className="input" value={form.country_id} onChange={e => { set('country_id', e.target.value); set('unit_ids', []) }}>
                  <option value="">Todos</option>
                  {countries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="label">Vigência (de)</label><input type="date" className="input" value={form.valid_from} onChange={e => set('valid_from', e.target.value)} /></div>
                <div><label className="label">Até</label><input type="date" className="input" value={form.valid_to} onChange={e => set('valid_to', e.target.value)} /></div>
              </div>
            </div>

            {/* Unidades participantes */}
            <div className="mt-4">
              <label className="label">Centros de custo participantes <span className="text-slate-400 font-normal">({form.unit_ids.length})</span>
                {selDriver?.kind === 'DIRECT' && <span className="ml-2 text-[11px] text-amber-600">driver DIRECT: selecione 1 centro de custo (100%)</span>}
              </label>
              <select className="input md:max-w-md" value="" onChange={e => { if (e.target.value) toggleUnit(e.target.value); e.currentTarget.value = '' }}>
                <option value="">Adicionar centro de custo…</option>
                {unitsForCountry.filter(u => !form.unit_ids.includes(u.id)).map(u => <option key={u.id} value={u.id}>{u.code} — {u.name}{u.unidade_nome ? ` · ${u.unidade_nome}` : ''}</option>)}
              </select>
              {form.unit_ids.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {form.unit_ids.map((id: string) => { const u = unitById(id); return (
                    <span key={id} className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-full pl-2 pr-1 py-0.5">
                      <span className="font-mono">{u?.code ?? '?'}</span>
                      <button type="button" onClick={() => toggleUnit(id)} className="hover:text-blue-900"><X className="w-3 h-3" /></button>
                    </span>) })}
                </div>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" className="w-4 h-4 rounded" checked={form.apply_actual} onChange={e => set('apply_actual', e.target.checked)} /> Aplica no Realizado</label>
              <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" className="w-4 h-4 rounded" checked={form.apply_budget} onChange={e => set('apply_budget', e.target.checked)} /> Aplica no Budget</label>
              {form.apply_budget && (
                <div className="flex items-center gap-2">
                  <label className="text-sm text-slate-500">Valor mensal do budget (R$)</label>
                  <input className="input h-9 w-36 text-sm font-mono" placeholder="0,00" value={form.budget_value}
                    onChange={e => set('budget_value', e.target.value)} />
                </div>
              )}
              <div className="flex items-center gap-2">
                <label className="text-sm text-slate-500">Status</label>
                <select className="input h-9 w-32 text-sm" value={form.status} onChange={e => set('status', e.target.value)}>
                  <option value="DRAFT">Rascunho</option>
                  <option value="ACTIVE">Ativa</option>
                  <option value="INACTIVE">Inativa</option>
                </select>
              </div>
            </div>

            {/* Camadas (cascata) */}
            <div className="mt-4 rounded-lg bg-slate-50 px-3 py-3 flex flex-wrap items-end gap-4">
              <div>
                <label className="label">Camada</label>
                <select className="input h-9 w-40 text-sm" value={form.step_order}
                  onChange={e => { const s = +e.target.value; set('step_order', s); set('source_origin', s > 1 ? 'CAMADA:1' : 'INICIAL'); if (s === 1) set('source_unit_id', '') }}>
                  <option value={1}>1 — custos iniciais</option>
                  <option value={2}>2 — saída da camada 1</option>
                </select>
              </div>
              {Number(form.step_order) > 1 && (
                <div>
                  <label className="label">CC de origem (hub da camada 1) *</label>
                  <select className="input h-9 w-64 text-sm" value={form.source_unit_id} onChange={e => set('source_unit_id', e.target.value)}>
                    <option value="">Selecione o CC cujo valor será redistribuído…</option>
                    {units.map(u => <option key={u.id} value={u.id}>{u.code}{u.name ? ` — ${u.name}` : ''}</option>)}
                  </select>
                </div>
              )}
              <span className="text-[11px] text-slate-400 flex-1 min-w-[180px]">
                Camada 1 rateia os custos iniciais. Camada 2 pega o valor que caiu num CC-hub da camada 1 e redistribui para os CCs-alvo desta regra.
              </span>
            </div>

            <div className="mt-4 flex items-center justify-between gap-2">
              <span className="text-[11px] text-slate-400">Salve a regra e use <b>▶ Simular</b> na lista para prever a distribuição.</span>
              <button type="submit" className="btn-primary flex items-center gap-1.5" disabled={saving}>
                <Plus className="w-4 h-4" /> {saving ? 'Salvando…' : form.id ? 'Atualizar regra' : 'Salvar'}
              </button>
            </div>
            {selDriver?.kind === 'MANUAL' && <p className="mt-2 text-[11px] text-slate-400">Driver MANUAL: após salvar, informe os percentuais na aba <b>Pesos Manuais</b>.</p>}
          </form>

          <div className="card overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100"><h2 className="text-sm font-semibold text-slate-800">Regras existentes ({rows.length})</h2></div>
            <div className="overflow-x-auto">
              <table className="tbl w-full text-sm">
                <thead><tr className="text-xs text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-100">
                  <th className="text-left px-4 py-3 font-medium">Fornecedor</th>
                  <th className="text-left px-4 py-3 font-medium">Serviço / Categoria</th>
                  <th className="text-left px-4 py-3 font-medium">Driver</th>
                  <th className="text-left px-4 py-3 font-medium">Vigência</th>
                  <th className="text-center px-4 py-3 font-medium">Unid.</th>
                  <th className="text-center px-4 py-3 font-medium">B/R</th>
                  <th className="text-center px-4 py-3 font-medium">Status</th>
                  <th className="text-center px-4 py-3 font-medium">Prontidão</th>
                  <th className="text-center px-4 py-3 font-medium">Ativo</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-50">
                  {rows.length === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center text-sm text-slate-400">{loading ? 'Carregando…' : 'Nenhuma regra'}</td></tr>}
                  {rows.map(r => (
                    <tr key={r.id} className={clsx('hover:bg-slate-50', !r.is_active && 'opacity-50')}>
                      <td className="px-4 py-2.5 text-slate-800">{r.supplier_short_name || r.supplier_name}</td>
                      <td className="px-4 py-2.5 text-slate-600 text-xs">{r.contract_name || <span className="text-slate-400">todo fornecedor</span>}{r.category_name ? ` · ${r.category_name}` : ''}{r.country_name ? ` · ${r.country_name}` : ''}</td>
                      <td className="px-4 py-2.5">
                        <span className="badge-gray font-mono text-[11px]">{r.driver_code}</span>
                        {(() => { const bc = baseChip(r); return bc ? <div className="mt-1"><span className={clsx('px-1.5 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap', bc.cls)}>{bc.label}</span></div> : null })()}
                      </td>
                      <td className="px-4 py-2.5 text-slate-500 text-xs">{r.valid_from ?? '—'}{r.valid_to ? ` → ${r.valid_to}` : ''}</td>
                      <td className="px-4 py-2.5 text-center text-xs text-slate-600">{(r.unit_ids || []).length || '—'}</td>
                      <td className="px-4 py-2.5 text-center text-[10px] text-slate-500">{[r.apply_budget && 'B', r.apply_actual && 'R'].filter(Boolean).join('/') || '—'}</td>
                      <td className="px-4 py-2.5 text-center"><span className={clsx('px-2 py-0.5 rounded-full text-[11px] font-medium', statusBadge(r.status))}>{r.status}</span></td>
                      <td className="px-4 py-2.5 text-center">{(() => { const rd = readiness(r); return <span className={clsx('px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap', rd.cls)}>{rd.label}</span> })()}</td>
                      <td className="px-4 py-2.5 text-center whitespace-nowrap">
                        <button onClick={() => openSim(r)} title="Simular rateio" className="text-slate-400 hover:text-blue-600 mr-1 align-middle"><PlayCircle className="w-5 h-5 inline" /></button>
                        <button onClick={() => openEdit(r)} title="Editar regra" className="text-slate-400 hover:text-blue-600 mr-1 align-middle"><Pencil className="w-4 h-4 inline" /></button>
                        <button onClick={() => handleToggle(r.id)} title="Ativar/desativar" className="text-slate-400 hover:text-blue-600 align-middle">
                          {r.is_active ? <ToggleRight className="w-5 h-5 text-blue-500 inline" /> : <ToggleLeft className="w-5 h-5 inline" />}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {tab === 'bases' && (
        <div className="card p-5">
          <div className="mb-3 text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
            Aqui aparecem só os drivers <b>por valor</b> ({drivers.filter(d => d.kind === 'VALUE').length}), que usam base numérica por CC.
            <b> Percentual manual</b> → configure na aba <b>Pesos Manuais</b>. <b>Divisão igualitária</b> e <b>100% unidade específica</b> não usam base.
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
            <div><label className="label">Driver (por valor)</label>
              <select className="input" value={bDriverId} onChange={e => setBDriverId(e.target.value)}>
                <option value="">Selecione…</option>
                {drivers.filter(d => d.kind === 'VALUE').map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div><label className="label">Cenário</label>
              <select className="input" value={bScenario} onChange={e => setBScenario(e.target.value as any)}>
                <option value="ACTUAL">Realizado (efetivo)</option>
                <option value="BUDGET">Budget (planejado)</option>
              </select>
            </div>
            <div><label className="label">Ano</label>
              <select className="input" value={bYear} onChange={e => setBYear(+e.target.value)}>
                {yearOptions().map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>
          {!bDriverId ? (
            <p className="text-sm text-slate-400">Selecione um driver <b>numérico</b> (Licenças, Colaboradores, Horas…) para informar a base. Igual/Manual/Direto não usam base.</p>
          ) : (
            <>
              <p className="text-xs text-slate-400 mb-3">
                Marque as unidades que usam este driver e informe o valor {(() => { const ul = drivers.find(d => d.id === bDriverId)?.unit_label; return ul ? <>em <b className="text-slate-600">{ul}</b> </> : null })()}.
                O valor é único — <b>dividido entre os CCs</b> da unidade e <b>replicado nos 12 meses</b>. {bLoading && <span className="text-blue-500">carregando…</span>}
              </p>
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <div className="relative flex-1 min-w-[160px] max-w-xs">
                  <input className="input pl-8 text-sm" placeholder="Buscar unidade…" value={bQ} onChange={e => setBQ(e.target.value)} />
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400">⌕</span>
                </div>
                <button type="button" onClick={() => toggleAll(true)} className="btn-secondary text-xs">Marcar todas</button>
                <button type="button" onClick={() => toggleAll(false)} className="btn-secondary text-xs">Limpar</button>
              </div>
              <div className="space-y-1 max-h-[460px] overflow-y-auto pr-1">
                {bUnidadesShown.length === 0 && <p className="text-sm text-slate-400 py-6 text-center">Nenhuma unidade.</p>}
                {bUnidadesShown.map(un => {
                  const checked = !!bChecked[un.id]
                  const V = parseFloat((bUniVals[un.id] || '').replace(',', '.')) || 0
                  const perCC = un.ccs.length ? V / un.ccs.length : 0
                  return (
                    <div key={un.id} className={clsx('flex items-center gap-3 px-3 py-2 rounded-lg border', checked ? 'border-blue-200 bg-blue-50/40' : 'border-slate-100')}>
                      <input type="checkbox" checked={checked} onChange={e => setBChecked(c => ({ ...c, [un.id]: e.target.checked }))} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-slate-800 truncate">{un.nome}</div>
                        <div className="text-[11px] text-slate-400">
                          {un.ccs.length} CC{un.ccs.length > 1 ? 's' : ''}{un.ccs.length > 1 && V > 0 ? ` · ${perCC.toLocaleString('pt-BR')} por CC` : ''}
                        </div>
                      </div>
                      <input type="number" step="0.001" min="0" placeholder="0"
                        className="input font-mono text-right w-28 text-sm"
                        value={bUniVals[un.id] ?? ''}
                        onChange={e => { const v = e.target.value; setBUniVals(s => ({ ...s, [un.id]: v })); if (v.trim() !== '') setBChecked(c => ({ ...c, [un.id]: true })) }} />
                    </div>
                  )
                })}
              </div>
              {bOrphans > 0 && (
                <p className="text-[11px] text-amber-600 mt-3">⚠️ {bOrphans} centro(s) de custo sem unidade não aparecem aqui — atribua a uma unidade no cadastro para informar a base deles.</p>
              )}
              <div className="flex items-center justify-between mt-4">
                <div className="text-xs text-slate-500">{Object.values(bChecked).filter(Boolean).length} unidade(s) marcada(s)</div>
                <button onClick={saveBase} className="btn-primary" disabled={bSaving}>{bSaving ? 'Salvando…' : 'Salvar Base'}</button>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'weights' && (
        <form onSubmit={handleWeightSave} className="card p-6">
          <div className="mb-4">
            <label className="label">Regra (driver MANUAL)</label>
            <select className="input w-full max-w-sm" value={wCriteriaId} onChange={e => { setWCriteriaId(e.target.value); setWeights({}) }}>
              <option value="">Selecione uma regra…</option>
              {manualRules.map(r => <option key={r.id} value={r.id}>{r.supplier_short_name || r.supplier_name}{r.contract_name ? ` — ${r.contract_name}` : ''}</option>)}
            </select>
          </div>
          {wCriteriaId && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                {wUnits.map(u => (
                  <div key={u.id}>
                    <label className="label">{u.code} — {u.name} <span className="text-slate-400 font-normal">(%)</span></label>
                    <input type="number" step="0.01" min="0" max="100" className="input font-mono" placeholder="0,00"
                      value={weights[u.id] ?? ''} onChange={e => setWeights(w => ({ ...w, [u.id]: e.target.value }))} />
                  </div>
                ))}
              </div>
              <div className={clsx('text-sm mb-4 flex items-center gap-2', wValid ? 'text-emerald-600' : 'text-red-600')}>
                Total: <b className="font-mono">{wTotal.toFixed(2)}%</b>
                {wValid ? <span className="text-xs">✓ soma 100%</span> : <span className="text-xs">— deve somar 100%</span>}
              </div>
              <div className="flex justify-end"><button type="submit" className="btn-primary" disabled={wSaving || !wValid}>{wSaving ? 'Salvando…' : 'Salvar Pesos'}</button></div>
            </>
          )}
        </form>
      )}

      {tab === 'apply' && (
        <div className="space-y-4">
          <div className="card p-4 flex flex-wrap items-end gap-3">
            <div>
              <label className="label">Mês</label>
              <select className="input h-9 w-32" value={aMonth} onChange={e => setAMonth(+e.target.value)}>
                {MONTHS_PT.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Ano</label>
              <select className="input h-9 w-24" value={aYear} onChange={e => setAYear(+e.target.value)}>
                {yearOptions().map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <button onClick={applyBudget} className="btn-primary" disabled={aApplying}>
              {aApplying ? 'Aplicando…' : 'Aplicar no Budget'}
            </button>
            {closed && <span className="text-xs text-slate-500 self-center">🔒 {MONTHS_PT[aMonth - 1]}/{aYear} fechado no Fechamento.</span>}
          </div>
          <div className="rounded-lg bg-blue-50/60 border border-blue-100 px-4 py-2.5 text-xs text-slate-600">
            O rateio do <b>Realizado</b> é <b>automático</b> — roda ao lançar a despesa e é <b>finalizado no <a href="/closing" className="text-blue-600 hover:underline">Fechamento</a></b>. Aqui você só aplica o <b>Budget</b> (ação deliberada) e consulta a memória de cálculo.
          </div>
          <div className="card overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">Memória de cálculo — {MONTHS_PT[aMonth - 1]}/{aYear} <span className="text-slate-400 font-normal">({memory.length} linha{memory.length === 1 ? '' : 's'})</span></h2>
            </div>
            <div className="overflow-x-auto">
              <table className="tbl w-full text-sm">
                <thead><tr className="text-[11px] text-slate-500 uppercase bg-slate-50 border-b border-slate-100">
                  <th className="text-left px-3 py-2 font-medium">Fornecedor</th>
                  <th className="text-left px-3 py-2 font-medium">Centro de Custo</th>
                  <th className="text-left px-3 py-2 font-medium">Driver</th>
                  <th className="text-right px-3 py-2 font-medium">Custo</th>
                  <th className="text-right px-3 py-2 font-medium">Driver (un/tot)</th>
                  <th className="text-right px-3 py-2 font-medium">%</th>
                  <th className="text-right px-3 py-2 font-medium">Alocado</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-50">
                  {memory.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400 text-xs">Sem memória neste período. O rateio do realizado é gerado ao lançar a despesa (automático).</td></tr>}
                  {memory.map((m: any) => (
                    <tr key={m.id} className="hover:bg-slate-50">
                      <td className="px-3 py-1.5 text-slate-700 text-xs">{m.supplier_name || '—'}</td>
                      <td className="px-3 py-1.5 text-slate-600 text-xs">{m.unit_code} — {m.unit_name}</td>
                      <td className="px-3 py-1.5"><span className="badge-gray font-mono text-[10px]">{m.driver_code}</span></td>
                      <td className="px-3 py-1.5 text-right font-mono text-xs text-slate-500 tabular-nums">{BRL(Number(m.cost_total))}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-[11px] text-slate-400 tabular-nums">{Number(m.driver_unit_value).toLocaleString('pt-BR')}/{Number(m.driver_total).toLocaleString('pt-BR')}{m.driver_unit ? <span className="text-slate-300"> {m.driver_unit}</span> : ''}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{Number(m.weight_pct).toFixed(1)}%</td>
                      <td className="px-3 py-1.5 text-right font-mono text-xs text-slate-800 tabular-nums">{BRL(Number(m.allocated))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'resumo' && (
        <div className="space-y-4">
          <div className="card p-4 flex flex-wrap items-end gap-3">
            <div><label className="label">Mês</label>
              <select className="input h-9 w-36" value={rMonth} onChange={e => setRMonth(+e.target.value)}>
                <option value={0}>Ano todo</option>
                {MONTHS_PT.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
              </select></div>
            <div><label className="label">Ano</label>
              <select className="input h-9 w-24" value={rYear} onChange={e => setRYear(+e.target.value)}>{yearOptions().map(y => <option key={y} value={y}>{y}</option>)}</select></div>
            <div><label className="label">Cenário</label>
              <select className="input h-9 w-36" value={rScenario} onChange={e => setRScenario(e.target.value as any)}>
                <option value="ACTUAL">Realizado</option><option value="BUDGET">Budget</option></select></div>
            <div className="ml-auto text-sm text-slate-500">Total geral: <b className="font-mono text-slate-800">{BRL(resumoGrand)}</b></div>
          </div>
          <div className="card overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100"><h2 className="text-sm font-semibold text-slate-800">Total de TI rateado por centro de custo</h2></div>
            <div className="overflow-x-auto">
              <table className="tbl w-full text-sm">
                <thead><tr className="text-[11px] text-slate-500 uppercase bg-slate-50 border-b border-slate-100">
                  <th className="text-left px-4 py-2 font-medium">Centro de Custo</th>
                  <th className="text-left px-4 py-2 font-medium">Unidade</th>
                  <th className="text-right px-4 py-2 font-medium">Total (R$)</th>
                  <th className="text-right px-4 py-2 font-medium">% da empresa</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-50">
                  {resumo.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400 text-xs">Sem rateio aplicado neste período. Aplique o rateio (aba &quot;Aplicação &amp; Memória&quot;) para ver o resumo.</td></tr>}
                  {Object.entries(resumoGroups).map(([emp, g]) => (
                    <Fragment key={emp}>
                      <tr className="bg-navy-50/60"><td colSpan={4} className="px-4 py-1.5 text-xs font-semibold text-navy-800">{emp} <span className="font-normal text-slate-400">· {BRL(g.total)} · {resumoGrand > 0 ? (g.total / resumoGrand * 100).toFixed(1) : '0'}% do total</span></td></tr>
                      {g.rows.map((r: any, i: number) => (
                        <tr key={emp + i} className="hover:bg-slate-50">
                          <td className="px-4 py-1.5 font-mono text-xs text-slate-600">{r.unit_code}</td>
                          <td className="px-4 py-1.5 text-xs text-slate-600">{r.unidade_name || '—'}</td>
                          <td className="px-4 py-1.5 text-right font-mono text-xs text-slate-800 tabular-nums">{BRL(Number(r.total))}</td>
                          <td className="px-4 py-1.5 text-right font-mono text-xs text-slate-500 tabular-nums">{g.total > 0 ? (Number(r.total) / g.total * 100).toFixed(2) : '0.00'}%</td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal Simular Rateio (F04) */}
      {sim && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setSim(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-5 max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-slate-800 text-sm">Simular Rateio — {sim.rule.supplier_short_name || sim.rule.supplier_name} · <span className="font-mono">{sim.rule.driver_code}</span></h3>
              <button onClick={() => setSim(null)} className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
              <div className="col-span-2"><label className="label">Custo total (R$)</label><input className="input font-mono" placeholder="0,00" value={sim.cost} onChange={e => setSim((s: any) => ({ ...s, cost: e.target.value }))} /></div>
              <div><label className="label">Cenário</label><select className="input" value={sim.scenario} onChange={e => setSim((s: any) => ({ ...s, scenario: e.target.value }))}><option value="ACTUAL">Realizado</option><option value="BUDGET">Budget</option></select></div>
              <div><label className="label">Mês</label><select className="input" value={sim.month} onChange={e => setSim((s: any) => ({ ...s, month: +e.target.value }))}>{MONTHS_PT.map((m, i) => <option key={i + 1} value={i + 1}>{m.slice(0, 3)}</option>)}</select></div>
            </div>
            <div className="flex justify-end mb-3"><button onClick={calcSim} className="btn-primary" disabled={sim.loading}>{sim.loading ? 'Calculando…' : 'Calcular'}</button></div>
            {sim.err && <div className="text-sm text-red-600 bg-red-50 rounded px-3 py-2 mb-2">{sim.err}</div>}
            {sim.result && (
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="tbl w-full text-sm">
                  <thead><tr className="text-[11px] text-slate-500 uppercase bg-slate-50">
                    <th className="text-left px-3 py-2 font-medium">Centro de Custo</th><th className="text-right px-3 py-2 font-medium">Driver</th><th className="text-right px-3 py-2 font-medium">%</th><th className="text-right px-3 py-2 font-medium">Valor</th>
                  </tr></thead>
                  <tbody className="divide-y divide-slate-50">
                    {sim.result.lines.length === 0 && <tr><td colSpan={4} className="px-3 py-4 text-center text-slate-400 text-xs">Sem base/pesos para distribuir neste período.</td></tr>}
                    {sim.result.lines.map((l: any) => (
                      <tr key={l.unit_id}><td className="px-3 py-1.5 text-slate-700 text-xs">{l.code} — {l.name}</td><td className="px-3 py-1.5 text-right font-mono text-slate-500 tabular-nums">{Number(l.driver_value).toLocaleString('pt-BR')}</td><td className="px-3 py-1.5 text-right font-mono tabular-nums">{l.pct.toFixed(1)}%</td><td className="px-3 py-1.5 text-right font-mono text-slate-800 tabular-nums">{BRL(l.allocated)}</td></tr>
                    ))}
                  </tbody>
                  <tfoot><tr className="bg-slate-50 font-semibold text-slate-800">
                    <td className="px-3 py-2 text-xs uppercase">Total</td><td className="px-3 py-2 text-right font-mono tabular-nums">{Number(sim.result.driver_total).toLocaleString('pt-BR')}</td><td className="px-3 py-2 text-right">100%</td>
                    <td className={clsx('px-3 py-2 text-right font-mono tabular-nums', sim.result.ok ? 'text-emerald-600' : 'text-red-600')}>{BRL(sim.result.reconciled)}</td>
                  </tr></tfoot>
                </table>
                <div className={clsx('px-3 py-2 text-xs', sim.result.ok ? 'text-emerald-600' : 'text-red-600')}>{sim.result.ok ? '✓ Reconciliado com o custo original' : '⚠ Não reconciliou — confira a base do driver / pesos do período'}</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
