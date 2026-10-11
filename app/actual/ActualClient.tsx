'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { AuthUser } from '@/lib/auth'
import { MONTHS_PT } from '@/lib/types'
import { yearOptions, DEFAULT_YEAR } from '@/lib/years'
import { Plus, Trash2, RefreshCw, Zap, Save, Upload } from 'lucide-react'
import Link from 'next/link'
import clsx from 'clsx'

const BRL = (n: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 }).format(n)
const parseNum = (s: string) => { const n = parseFloat(String(s).replace(/\./g, '').replace(',', '.')); return isNaN(n) ? NaN : n }

interface Props {
  user: AuthUser
  units: any[]; categories: any[]; suppliers: any[]; countries: any[]; platforms: any[]
  scope: { platform_id: string | null; country_id: string | null; unit_id: string | null }
}
interface EntryRow { unidade_id: string; unit_id: string; category_id: string; supplier_id: string; value: string; invoice_ref: string; description: string; cost_class: string }
const emptyEntry = (unit = ''): EntryRow => ({ unidade_id: '', unit_id: unit, category_id: '', supplier_id: '', value: '', invoice_ref: '', description: '', cost_class: '' })

export default function ActualClient({ user, units, categories, suppliers, countries, platforms, scope }: Props) {
  const now = new Date()
  const lockUnit = user.role !== 'admin' && !!scope.unit_id
  const lockCountry = user.role !== 'admin' && !scope.unit_id && !!scope.country_id
  const lockPlatform = user.role !== 'admin' && !scope.unit_id && !scope.country_id && !!scope.platform_id

  const [year, setYear] = useState(DEFAULT_YEAR)
  const [month, setMonth] = useState(now.getMonth() + 1) // mês corrente por padrão
  const [platformId, setPlatformId] = useState(lockPlatform ? scope.platform_id! : '')
  const [countryId, setCountryId] = useState(lockCountry ? scope.country_id! : '')
  const [unitId, setUnitId] = useState(lockUnit ? scope.unit_id! : (user.unit_id ?? ''))
  const [unidadeId, setUnidadeId] = useState('')
  const [rows, setRows] = useState<any[]>([])
  const [missing, setMissing] = useState<any[]>([])
  const [sum, setSum] = useState<{ budgetMonth: number; actualMonth: number; pendingBudget: number }>({ budgetMonth: 0, actualMonth: 0, pendingBudget: 0 })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [payingId, setPayingId] = useState<string | null>(null)
  const [rateioLoading, setRateioLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [entries, setEntries] = useState<EntryRow[]>([])
  const [pending, setPending] = useState<Record<string, { unidade_id: string; unit_id: string; category_id: string; value: string; invoice_ref: string; cost_class?: string }>>({})
  const catCC: Record<string, string> = Object.fromEntries(categories.map((c: any) => [c.id, c.cost_class || '']))
  const CC_OPTS = ['OPEX', 'CAPEX', 'OTC']

  const platByCountry = useMemo(() => new Map(countries.map(c => [String(c.id), c.platform_id ? String(c.platform_id) : null])), [countries])
  const effPlatformId = lockPlatform ? scope.platform_id! : platformId
  const scopedUnits = units.filter(u => {
    if (lockUnit) return u.id === scope.unit_id
    if (lockCountry) return u.country_id === scope.country_id
    if (effPlatformId) return platByCountry.get(String(u.country_id)) === String(effPlatformId)
    return true
  })
  const unitOptions = scopedUnits.filter(u => !countryId || u.country_id === countryId)
  const unidadeOptions = (() => {
    const m = new Map<string, string>()
    for (const u of unitOptions) if (u.unidade_id) m.set(String(u.unidade_id), u.unidade_nome)
    return [...m.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => String(a.name).localeCompare(String(b.name)))
  })()
  const unidadeOfUnit = (uid: string) => { const u = units.find(x => String(x.id) === String(uid)); return u?.unidade_id ? String(u.unidade_id) : '' }
  const ccsOfUnidade = (uid: string) => unitOptions.filter(u => String(u.unidade_id) === String(uid))
  const countryOptions = lockCountry ? countries.filter(c => c.id === scope.country_id) : countries.filter(c => !effPlatformId || String(c.platform_id) === String(effPlatformId))
  const platformOptions = lockPlatform ? platforms.filter(p => p.id === scope.platform_id) : platforms
  const showPlatform = user.role === 'admin' || lockPlatform

  const scopeParams = () => {
    const p = new URLSearchParams({ year: String(year), month: String(month) })
    if (effPlatformId) p.set('platform_id', effPlatformId)
    if (countryId) p.set('country_id', countryId)
    if (unitId) p.set('unit_id', unitId)
    if (unidadeId) p.set('unidade_id', unidadeId)
    return p
  }

  const load = useCallback(async () => {
    setLoading(true)
    const [a, m, su] = await Promise.all([
      fetch(`/api/actual?${scopeParams()}`).then(r => r.json()).catch(() => []),
      fetch(`/api/actual/missing?${scopeParams()}`).then(r => r.json()).catch(() => []),
      fetch(`/api/actual/summary?${scopeParams()}`).then(r => r.json()).catch(() => null),
    ])
    setRows(Array.isArray(a) ? a : [])
    setMissing(Array.isArray(m) ? m : [])
    setSum(su && typeof su.budgetMonth === 'number' ? su : { budgetMonth: 0, actualMonth: 0, pendingBudget: 0 })
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month, unitId, unidadeId, countryId, effPlatformId])
  useEffect(() => { load() }, [load])

  // inicializa os campos das linhas pendentes (unidade/categoria = maior budget do fornecedor)
  useEffect(() => {
    const init: any = {}
    for (const m of missing) { const uid = unitId || m.unit_id || ''; init[m.key] = { unidade_id: unidadeOfUnit(uid), unit_id: uid, category_id: m.category_id || '', value: '', invoice_ref: '', cost_class: m.cost_class || catCC[m.category_id] || '' } }
    setPending(init)
  }, [missing, unitId])

  const setPend = (id: string, k: string, v: string) => setPending(p => ({ ...p, [id]: { ...p[id], [k]: v } }))
  async function savePending(m: any) {
    const p = pending[m.key]
    const cat = m.category_id || p?.category_id
    if (!p?.unit_id || !cat || !p?.value) { setMsg('Erro: preencha unidade, categoria e valor.'); return }
    setSaving(true); setMsg('')
    const res = await fetch('/api/actual', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ unit_id: p.unit_id, category_id: cat, supplier_id: m.id, year, month, value: parseNum(p.value), doc_ref: p.invoice_ref || null, cost_class: p.cost_class || catCC[cat] || null }),
    })
    const d = await res.json().catch(() => ({}))
    setSaving(false)
    if (res.ok && d.saved) { setMsg(d.rateio?.lines ? `Lançamento de ${m.name} salvo — rateado em ${d.rateio.lines} unidade(s).` : `Lançamento de ${m.name} salvo.`); load() }
    else setMsg(d.error || (d.errors ? 'Verifique os campos.' : 'Erro ao salvar.'))
  }

  // ── lançamento (unitário ou em lote) ──
  const addEntry = (prefill: Partial<EntryRow> = {}) => setEntries(e => [...e, { ...emptyEntry(unitId), unidade_id: unidadeOfUnit(unitId) || unidadeId || '', ...prefill }])
  const updEntry = (i: number, k: keyof EntryRow, v: string) => setEntries(e => e.map((r, idx) => idx === i ? { ...r, [k]: v } : r))
  const delEntry = (i: number) => setEntries(e => e.filter((_, idx) => idx !== i))

  async function saveEntries() {
    const valid = entries.filter(r => r.unit_id && r.category_id && r.value)
    if (!valid.length) { setMsg('Erro: preencha ao menos uma linha (unidade, categoria, valor).'); return }
    setSaving(true); setMsg('')
    const payload = {
      rows: valid.map(r => ({
        unit_id: r.unit_id, category_id: r.category_id, supplier_id: r.supplier_id || null,
        year, month, value: parseNum(r.value), doc_ref: r.invoice_ref || null, note: r.description || null,
        cost_class: r.cost_class || catCC[r.category_id] || null,
      })),
    }
    const res = await fetch('/api/actual', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const d = await res.json().catch(() => ({}))
    setSaving(false)
    if (res.ok) { setEntries([]); setMsg(`${d.saved} lançamento(s) salvo(s)${d.errors ? `, ${d.errors} com erro` : ''}.`); load() }
    else setMsg(d.error || 'Erro ao salvar.')
  }

  async function handleDelete(id: string) {
    if (!confirm('Remover este lançamento?')) return
    await fetch('/api/actual', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    load()
  }
  // marca/desmarca pago (status de pagamento) direto na linha
  async function togglePaid(r: any) {
    const next = r.payment_status === 'PAID' ? 'ACCRUED' : 'PAID'
    setPayingId(r.id)
    setRows(rs => rs.map(x => x.id === r.id ? { ...x, payment_status: next } : x))   // otimista
    const res = await fetch('/api/actual', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: r.id, payment_status: next }) })
    if (!res.ok) setRows(rs => rs.map(x => x.id === r.id ? { ...x, payment_status: r.payment_status } : x))  // reverte em erro
    setPayingId(null)
  }
  async function handleRateio() {
    if (!confirm(`Executar rateio para ${MONTHS_PT[month - 1]}/${year}?`)) return
    setRateioLoading(true); setMsg('')
    const res = await fetch('/api/actual/rateio', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ year, month }) })
    const d = await res.json(); if (res.ok) { load(); setMsg('Rateio executado.') } else setMsg(d.error || 'Erro no rateio.')
    setRateioLoading(false)
  }

  const totalDireto = rows.filter(r => r.origin === 'DIRETO').reduce((s, r) => s + Number(r.amount || 0), 0)
  const totalRateado = rows.filter(r => r.origin === 'RATEADO_ADM').reduce((s, r) => s + Number(r.amount || 0), 0)
  const totalGeral = rows.reduce((s, r) => s + Number(r.amount || 0), 0)
  const isAdmin = user.role === 'admin'
  const canLancar = isAdmin || user.role === 'lancador'   // lançador pode lançar/editar realizado (não configura rateio)

  const sel = (v: string, set: (s: string) => void, opts: any[], ph: string, w: string, dis = false, lbl = (o: any) => o.name) => (
    <select className={clsx('input text-sm', w)} value={v} disabled={dis} onChange={e => set(e.target.value)}>
      <option value="">{ph}</option>
      {opts.map(o => <option key={o.id} value={o.id}>{lbl(o)}</option>)}
    </select>
  )

  return (
    <div className="page-wide space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Ordem de pagamento</h1>
          <p className="text-sm text-slate-500">Lançamentos de {MONTHS_PT[month - 1]}/{year}</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {showPlatform && sel(effPlatformId, v => { setPlatformId(v); setCountryId(''); setUnidadeId(''); if (!lockUnit) setUnitId('') }, platformOptions, 'Todas as plataformas', 'w-36', lockPlatform)}
          {(canLancar || lockCountry) && sel(countryId, v => { setCountryId(v); setUnidadeId(''); if (!lockUnit) setUnitId('') }, countryOptions, 'Todos os países', 'w-32', lockCountry)}
          {!lockUnit
            ? sel(unidadeId, setUnidadeId, unidadeOptions, 'Todas as unidades', 'w-44')
            : <span className="text-sm text-slate-600 px-2 py-1 rounded bg-slate-100">{units.find(u => u.id === scope.unit_id)?.code ?? ''}</span>}
          <select className="input w-28 text-sm" value={month} onChange={e => setMonth(+e.target.value)}>
            {MONTHS_PT.map((m, i) => <option key={i + 1} value={i + 1}>{m.slice(0, 3)}</option>)}
          </select>
          <select className="input w-24 text-sm" value={year} onChange={e => setYear(+e.target.value)}>
            {yearOptions().map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={load} className="btn-secondary" disabled={loading}><RefreshCw className={clsx('w-4 h-4', loading && 'animate-spin')} /></button>
          {canLancar && <Link href="/actual/import" className="btn-secondary flex items-center gap-1.5 text-sm"><Upload className="w-4 h-4" /> Importar CSV</Link>}
          {isAdmin && <button onClick={handleRateio} className="btn-secondary flex items-center gap-1.5" disabled={rateioLoading}><Zap className={clsx('w-4 h-4', rateioLoading && 'animate-pulse')} />Rateio</button>}
        </div>
      </div>

      {msg && <div className={clsx('px-4 py-2 rounded-lg text-sm', msg.includes('Erro') ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700')}>{msg}</div>}

      {(() => {
        const pend = sum.budgetMonth - sum.actualMonth
        const pctReal = sum.budgetMonth > 0 ? sum.actualMonth / sum.budgetMonth * 100 : 0
        const cards = [
          { label: 'Serviços a lançar', main: String(missing.length), sub: `${MONTHS_PT[month - 1]}`, color: missing.length > 0 ? 'text-amber-600' : 'text-emerald-600' },
          { label: 'Realizado acumulado', main: BRL(sum.actualMonth), sub: `${pctReal.toFixed(0)}% do budget`, color: 'text-slate-800' },
          { label: 'Budget do mês', main: BRL(sum.budgetMonth), sub: 'orçado', color: 'text-slate-800' },
          { label: 'Pendente vs budget', main: BRL(pend), sub: sum.budgetMonth > 0 ? `${(pend / sum.budgetMonth * 100).toFixed(0)}% a lançar` : '—', color: pend > 0 ? 'text-red-600' : 'text-emerald-600' },
        ]
        return (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {cards.map(k => (
              <div key={k.label} className="card p-4">
                <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">{k.label}</p>
                <p className={clsx('text-xl font-bold font-mono', k.color)}>{k.main}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">{k.sub}</p>
              </div>
            ))}
          </div>
        )
      })()}
      <div className="flex flex-wrap gap-4 text-xs text-slate-500">
        <span>Direto: <b className="font-mono text-slate-700">{BRL(totalDireto)}</b></span>
        <span>Rateado: <b className="font-mono text-slate-700">{BRL(totalRateado)}</b></span>
        <span>Total lançado (mês): <b className="font-mono text-slate-700">{BRL(totalGeral)}</b></span>
      </div>

      {/* Lançamento manual (unitário ou em lote) */}
      {canLancar && (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-800">Novo lançamento (unitário ou em lote)</h2>
            <button onClick={() => addEntry()} className="btn-secondary text-sm flex items-center gap-1.5"><Plus className="w-4 h-4" /> Adicionar linha</button>
          </div>
          {entries.length === 0
            ? <p className="text-xs text-slate-400">Clique em "Adicionar linha" (ou num fornecedor pendente acima) para lançar. Você pode adicionar várias linhas e salvar de uma vez.</p>
            : (
              <div className="overflow-x-auto">
                <table className="tbl w-full text-sm">
                  <thead><tr className="text-[10px] text-slate-500 uppercase bg-slate-50">
                    <th className="text-left px-2 py-1.5">Unidade</th><th className="text-left px-2 py-1.5">Centro de Custo</th><th className="text-left px-2 py-1.5">Categoria</th><th className="text-left px-2 py-1.5">Tratamento</th><th className="text-left px-2 py-1.5">Fornecedor</th>
                    <th className="text-right px-2 py-1.5">Valor</th><th className="text-left px-2 py-1.5">NF/Ref.</th><th className="text-left px-2 py-1.5">Descrição</th><th className="px-2 py-1.5" />
                  </tr></thead>
                  <tbody>
                    {entries.map((r, i) => (
                      <tr key={i} className="border-t border-slate-50">
                        <td className="px-2 py-1"><select className="input text-xs" value={r.unidade_id} onChange={e => setEntries(es => es.map((row, idx) => idx === i ? { ...row, unidade_id: e.target.value, unit_id: '' } : row))}><option value="">…</option>{unidadeOptions.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></td>
                        <td className="px-2 py-1"><select className="input text-xs" value={r.unit_id} onChange={e => updEntry(i, 'unit_id', e.target.value)} disabled={!r.unidade_id}><option value="">…</option>{ccsOfUnidade(r.unidade_id).map(u => <option key={u.id} value={u.id}>{u.code}</option>)}</select></td>
                        <td className="px-2 py-1"><select className="input text-xs" value={r.category_id} onChange={e => { const cid = e.target.value; setEntries(es => es.map((row, idx) => idx === i ? { ...row, category_id: cid, cost_class: row.cost_class || catCC[cid] || '' } : row)) }}><option value="">…</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></td>
                        <td className="px-2 py-1"><select className="input text-xs" value={r.cost_class || catCC[r.category_id] || ''} onChange={e => updEntry(i, 'cost_class', e.target.value)}><option value="">—</option>{CC_OPTS.map(o => <option key={o} value={o}>{o}</option>)}</select></td>
                        <td className="px-2 py-1"><select className="input text-xs" value={r.supplier_id} onChange={e => updEntry(i, 'supplier_id', e.target.value)}><option value="">—</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.short_name || s.name}</option>)}</select></td>
                        <td className="px-2 py-1"><input className="input text-xs text-right font-mono w-28" placeholder="0,00" value={r.value} onChange={e => updEntry(i, 'value', e.target.value)} /></td>
                        <td className="px-2 py-1"><input className="input text-xs w-28" value={r.invoice_ref} onChange={e => updEntry(i, 'invoice_ref', e.target.value)} /></td>
                        <td className="px-2 py-1"><input className="input text-xs" value={r.description} onChange={e => updEntry(i, 'description', e.target.value)} /></td>
                        <td className="px-2 py-1 text-right"><button onClick={() => delEntry(i)} className="p-1 text-slate-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex justify-end mt-3">
                  <button onClick={saveEntries} className="btn-primary flex items-center gap-1.5" disabled={saving}><Save className="w-4 h-4" />{saving ? 'Salvando…' : `Salvar ${entries.filter(r => r.unit_id && r.category_id && r.value).length} lançamento(s)`}</button>
                </div>
              </div>
            )}
        </div>
      )}

      {/* Lista */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-3">
          <h2 className="text-sm font-semibold text-slate-800">Lançamentos de {MONTHS_PT[month - 1]}</h2>
          <span className="text-xs text-slate-400">{rows.length} lançado(s)</span>
          {canLancar && missing.length > 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">{missing.length} pendente(s) — preencha o valor e clique no ✓</span>}
        </div>
        <div className="overflow-x-auto">
          <table className="tbl w-full text-sm">
            <thead><tr className="text-xs text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-100">
              <th className="text-left px-4 py-3 font-medium">Unidade</th><th className="text-left px-4 py-3 font-medium">Centro de Custo</th><th className="text-left px-4 py-3 font-medium">Categoria</th>
              <th className="text-left px-4 py-3 font-medium">Tratamento</th>
              <th className="text-left px-4 py-3 font-medium">Fornecedor</th><th className="text-left px-4 py-3 font-medium">Descrição</th>
              <th className="text-left px-4 py-3 font-medium">NF/Ref.</th><th className="text-center px-4 py-3 font-medium">Status</th>
              <th className="text-right px-4 py-3 font-medium">Valor</th>{canLancar && <th className="px-4 py-3" />}
            </tr></thead>
            <tbody className="divide-y divide-slate-50">
              {rows.length === 0 && (!canLancar || missing.length === 0) && <tr><td colSpan={10} className="px-4 py-8 text-center text-sm text-slate-400">{loading ? 'Carregando…' : 'Nenhum lançamento para o período'}</td></tr>}
              {canLancar && missing.map(m => {
                const p = pending[m.key] || { unidade_id: '', unit_id: '', category_id: '', value: '', invoice_ref: '', cost_class: '' }
                const isRateio = m.has_rule
                return (
                  <tr key={'p' + m.key} className="bg-amber-50/50">
                    {isRateio ? (
                      <td className="px-2 py-1.5" colSpan={2}>
                        <span className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full bg-violet-50 text-violet-700 border border-violet-200" title="O valor total deste serviço será distribuído automaticamente pelas unidades conforme a regra de rateio do fornecedor+categoria.">
                          <Save className="w-3 h-3" /> Rateio automático
                        </span>
                      </td>
                    ) : (
                      <>
                        <td className="px-2 py-1.5"><select className="input text-xs" value={p.unidade_id} onChange={e => setPending(pp => ({ ...pp, [m.key]: { ...pp[m.key], unidade_id: e.target.value, unit_id: '' } }))}><option value="">…</option>{unidadeOptions.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></td>
                        <td className="px-2 py-1.5"><select className="input text-xs" value={p.unit_id} onChange={e => setPend(m.key, 'unit_id', e.target.value)} disabled={!p.unidade_id}><option value="">…</option>{ccsOfUnidade(p.unidade_id).map(u => <option key={u.id} value={u.id}>{u.code}</option>)}</select></td>
                      </>
                    )}
                    <td className="px-4 py-1.5 text-slate-700 text-xs">{m.category_name ?? '—'}</td>
                    <td className="px-2 py-1.5"><select className="input text-xs" value={p.cost_class || catCC[m.category_id] || ''} onChange={e => setPend(m.key, 'cost_class', e.target.value)}><option value="">—</option>{CC_OPTS.map(o => <option key={o} value={o}>{o}</option>)}</select></td>
                    <td className="px-4 py-1.5 text-slate-700 text-xs">{m.name}</td>
                    <td className="px-4 py-1.5 text-slate-300 text-xs">—</td>
                    <td className="px-2 py-1.5"><input className="input text-xs w-24" value={p.invoice_ref} onChange={e => setPend(m.key, 'invoice_ref', e.target.value)} placeholder="NF/Ref" /></td>
                    <td className="px-4 py-1.5 text-center"><span className="badge-yellow">Pendente</span></td>
                    <td className="px-2 py-1.5 text-right"><input className="input text-xs text-right font-mono w-24" value={p.value} onChange={e => setPend(m.key, 'value', e.target.value)} placeholder="0,00" /></td>
                    <td className="px-2 py-1.5 text-right"><button onClick={() => savePending(m)} disabled={saving} className="p-1 text-emerald-600 hover:text-emerald-700" title="Lançar"><Save className="w-4 h-4" /></button></td>
                  </tr>
                )
              })}
              {rows.map(r => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 text-xs text-slate-600">{r.unidade_nome ?? '—'}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-500 font-mono">{r.unit_code ?? '—'}</td>
                  <td className="px-4 py-2.5 text-slate-800">{r.category_name ?? '—'}</td>
                  <td className="px-4 py-2.5 text-xs">{r.cost_class ? <span className="badge-gray">{r.cost_class}</span> : <span className="text-slate-300">—</span>}</td>
                  <td className="px-4 py-2.5 text-slate-600 text-xs">{r.supplier_name ?? '—'}</td>
                  <td className="px-4 py-2.5 text-slate-500 text-xs max-w-[160px] truncate">{r.description ?? '—'}</td>
                  <td className="px-4 py-2.5 text-slate-500 text-xs">{r.invoice_ref ?? '—'}</td>
                  <td className="px-4 py-2.5 text-center">
                    {r.origin === 'DIRETO' ? (
                      <button onClick={() => togglePaid(r)} disabled={payingId === r.id}
                        title={r.payment_status === 'PAID' ? 'Pago — clique para marcar como pendente' : 'Pendente — clique para marcar como pago'}
                        className={clsx('inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-colors disabled:opacity-50',
                          r.payment_status === 'PAID' ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-amber-50 text-amber-700 hover:bg-amber-100')}>
                        {r.payment_status === 'PAID' ? '✓ Pago' : 'Pendente'}
                      </button>
                    ) : <span className="text-slate-300 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs font-medium text-slate-800">{BRL(Number(r.amount || 0))}</td>
                  {canLancar && <td className="px-4 py-2.5 text-right">{r.origin === 'DIRETO' && <button onClick={() => handleDelete(r.id)} className="p-1 text-slate-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
