'use client'
import { useState, useEffect, useCallback } from 'react'
import { yearOptions, DEFAULT_YEAR } from '@/lib/years'
import { Pencil, Trash2, Plus, FileSignature, Search } from 'lucide-react'
import GuideCard from '@/components/GuideCard'
import clsx from 'clsx'

interface Opt { id: string; code?: string; name: string }
const money = (n: number, cur = 'USD') => { try { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(n) } catch { return `${cur} ${Math.round(n).toLocaleString('pt-BR')}` } }

const empty = {
  id: '', code: '', name: '', supplier_id: '', unit_id: '', category_id: '', cost_center_id: '', currency_id: '',
  cost_class: 'OPEX', total_value: '', monthly_value: '', periodicity: 'MENSAL',
  start_date: '', end_date: '', readjust_index: '', readjust_month: '', notes: '',
}

export default function ContractsClient({ suppliers, units, categories, costCenters, currencies }: {
  suppliers: Opt[]; units: Opt[]; categories: Opt[]; costCenters: Opt[]; currencies: Opt[]
}) {
  const [list, setList] = useState<any[]>([])
  const [form, setForm] = useState<any>({ ...empty })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [year, setYear] = useState(DEFAULT_YEAR)
  const [committed, setCommitted] = useState<{ total: number; bySupplier: any[] }>({ total: 0, bySupplier: [] })
  const [filterSupplier, setFilterSupplier] = useState('')
  const [q, setQ] = useState('')
  const nqC = (s: any) => String(s ?? '').toLowerCase()

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  const load = useCallback(async () => {
    const r = await fetch('/api/contracts'); const d = await r.json()
    setList(Array.isArray(d) ? d : [])
  }, [])
  const loadCommitted = useCallback(async () => {
    const r = await fetch(`/api/contracts/committed?year=${year}&usd=1`); const d = await r.json().catch(() => ({}))
    setCommitted({ total: d.total || 0, bySupplier: d.bySupplier || [] })
  }, [year])
  useEffect(() => { load() }, [load])
  useEffect(() => { loadCommitted() }, [loadCommitted, list])

  function edit(c: any) {
    setForm({
      ...empty, ...c,
      total_value: c.total_value ?? '', monthly_value: c.monthly_value ?? '',
      readjust_month: c.readjust_month ?? '', code: c.code ?? '', notes: c.notes ?? '',
      supplier_id: c.supplier_id ?? '', unit_id: c.unit_id ?? '', category_id: c.category_id ?? '',
      cost_center_id: c.cost_center_id ?? '', currency_id: c.currency_id ?? '',
      start_date: c.start_date ?? '', end_date: c.end_date ?? '', readjust_index: c.readjust_index ?? '',
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const reset = () => { setForm({ ...empty }); setErr('') }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { setErr('Nome é obrigatório.'); return }
    setSaving(true); setErr('')
    const method = form.id ? 'PATCH' : 'POST'
    const res = await fetch('/api/contracts', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    const d = await res.json().catch(() => ({}))
    setSaving(false)
    if (res.ok) { reset(); load() } else setErr(d.error || 'Erro ao salvar.')
  }
  async function del(id: string) {
    if (!confirm('Excluir contrato?')) return
    await fetch('/api/contracts', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    load()
  }

  return (
    <div className="page space-y-6">
      <div>
        <h1 className="page-title flex items-center gap-2"><FileSignature className="w-5 h-5 text-blue-600" /> Contratos</h1>
        <p className="text-sm text-slate-500">Valor, vigência, moeda, reajuste e comprometimento futuro por fornecedor/unidade/categoria.</p>
      </div>

      <GuideCard storageKey="/cadastros/contratos"
        steps={[
          'Selecione o Fornecedor e (opcional) a Categoria e a Unidade do contrato.',
          'Um mesmo fornecedor pode ter vários contratos — um por unidade/serviço, com vigências e valores diferentes.',
          'Informe Classe (OPEX/CAPEX), Valores, Vigência (início/fim) e, se houver, Índice/Mês de reajuste.',
        ]}
        note="O Código é opcional, mas se preenchido deve ser único. Cadastre antes o Fornecedor e a Unidade."
      />

      {/* Comprometido no ano */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-slate-800">Comprometido (Committed) — consolidado em USD</h2>
          <select className="input w-24 text-sm" value={year} onChange={e => setYear(+e.target.value)}>
            {yearOptions().map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <p className="text-2xl font-bold font-mono text-slate-900">{money(committed.total, 'USD')}</p>
        <p className="text-xs text-slate-400 mt-1">Soma da expansão mensal dos contratos ativos em {year} (valor mensal, ou total ÷ meses de vigência).</p>
      </div>

      {/* Formulário */}
      <form onSubmit={save} className="card p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div><label className="label">Nome *</label><input className="input" value={form.name} onChange={e => set('name', e.target.value)} /></div>
          <div><label className="label">Código</label><input className="input" value={form.code} onChange={e => set('code', e.target.value)} /></div>
          <div><label className="label">Fornecedor</label>
            <select className="input" value={form.supplier_id} onChange={e => set('supplier_id', e.target.value)}>
              <option value="">—</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div><label className="label">Unidade</label>
            <select className="input" value={form.unit_id} onChange={e => set('unit_id', e.target.value)}>
              <option value="">—</option>{units.map(u => <option key={u.id} value={u.id}>{u.code} — {u.name}</option>)}
            </select>
          </div>
          <div><label className="label">Categoria</label>
            <select className="input" value={form.category_id} onChange={e => set('category_id', e.target.value)}>
              <option value="">—</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div><label className="label">Moeda</label>
            <select className="input" value={form.currency_id} onChange={e => set('currency_id', e.target.value)}>
              <option value="">—</option>{currencies.map(c => <option key={c.id} value={c.id}>{c.code}</option>)}
            </select>
          </div>
          <div><label className="label">Classe</label>
            <select className="input" value={form.cost_class} onChange={e => set('cost_class', e.target.value)}>
              <option value="OPEX">OPEX</option><option value="CAPEX">CAPEX</option><option value="OTC">OTC</option>
            </select>
          </div>
          <div><label className="label">Periodicidade</label>
            <select className="input" value={form.periodicity} onChange={e => set('periodicity', e.target.value)}>
              <option value="MENSAL">Mensal</option><option value="ANUAL">Anual</option><option value="UNICO">Único</option>
            </select>
          </div>
          <div><label className="label">Valor total</label><input className="input text-right font-mono" placeholder="0.00" value={form.total_value} onChange={e => set('total_value', e.target.value)} /></div>
          <div><label className="label">Valor mensal</label><input className="input text-right font-mono" placeholder="0.00" value={form.monthly_value} onChange={e => set('monthly_value', e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="label">Início</label><input type="date" className="input" value={form.start_date} onChange={e => set('start_date', e.target.value)} /></div>
            <div><label className="label">Fim</label><input type="date" className="input" value={form.end_date} onChange={e => set('end_date', e.target.value)} /></div>
          </div>
          <div><label className="label">Índice de reajuste</label><input className="input" placeholder="IPCA / IGPM / USD" value={form.readjust_index} onChange={e => set('readjust_index', e.target.value)} /></div>
          <div><label className="label">Mês de reajuste</label>
            <select className="input" value={form.readjust_month} onChange={e => set('readjust_month', e.target.value)}>
              <option value="">—</option>{Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
            </select>
          </div>
          <div className="md:col-span-2"><label className="label">Observações</label><input className="input" value={form.notes} onChange={e => set('notes', e.target.value)} /></div>
        </div>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="flex items-center gap-2">
          <button type="submit" className="btn-primary flex items-center gap-1.5" disabled={saving}>
            {form.id ? <><Pencil className="w-4 h-4" /> Atualizar</> : <><Plus className="w-4 h-4" /> Adicionar contrato</>}
          </button>
          {form.id && <button type="button" className="btn-secondary" onClick={reset}>Cancelar edição</button>}
        </div>
      </form>

      {/* Lista */}
      {(() => {
      const shown = list.filter(c =>
        (!filterSupplier || c.supplier_id === filterSupplier) &&
        (!q.trim() || [c.name, c.code, c.supplier_name, c.unit_code, c.category_name].some(v => nqC(v).includes(nqC(q)))))
      return (
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-sm font-semibold text-slate-800">Contratos ({shown.length}{shown.length !== list.length ? ` de ${list.length}` : ''})</h2>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative w-56">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input className="input h-8 text-sm pl-9" placeholder="Buscar contrato…" value={q} onChange={e => setQ(e.target.value)} />
            </div>
            <select className="input h-8 text-sm w-56" value={filterSupplier} onChange={e => setFilterSupplier(e.target.value)}>
              <option value="">Todos fornecedores</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="tbl w-full text-sm">
            <thead><tr className="text-xs text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-100">
              <th className="text-left px-4 py-2.5 font-medium">Contrato</th>
              <th className="text-left px-4 py-2.5 font-medium">Fornecedor</th>
              <th className="text-left px-4 py-2.5 font-medium">Unidade</th>
              <th className="text-left px-4 py-2.5 font-medium">Classe</th>
              <th className="text-right px-4 py-2.5 font-medium">Mensal</th>
              <th className="text-center px-4 py-2.5 font-medium">Vigência</th>
              <th className="px-4 py-2.5" />
            </tr></thead>
            <tbody className="divide-y divide-slate-50">
              {shown.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">Nenhum contrato</td></tr>}
              {shown.map(c => (
                <tr key={c.id} className={clsx('hover:bg-slate-50', !c.is_active && 'opacity-50')}>
                  <td className="px-4 py-2.5 text-slate-700">{c.name}{c.code && <span className="text-slate-400 text-xs ml-1">({c.code})</span>}</td>
                  <td className="px-4 py-2.5 text-slate-600 text-xs">{c.supplier_name || '—'}</td>
                  <td className="px-4 py-2.5 text-slate-600 text-xs">{c.unit_code || '—'}</td>
                  <td className="px-4 py-2.5 text-slate-500 text-xs">{c.cost_class}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs text-slate-700">{c.monthly_value != null ? money(Number(c.monthly_value), c.currency_code || 'USD') : '—'}</td>
                  <td className="px-4 py-2.5 text-center text-xs text-slate-500">{c.start_date || '?'} → {c.end_date || '?'}</td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <button onClick={() => edit(c)} className="p-1 text-slate-400 hover:text-blue-600"><Pencil className="w-4 h-4" /></button>
                    <button onClick={() => del(c.id)} className="p-1 text-slate-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      ) })()}
    </div>
  )
}
