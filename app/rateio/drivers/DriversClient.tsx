'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Gauge, Plus, Pencil, Trash2, RefreshCw, ArrowLeft, Search, X, AlertTriangle, Check } from 'lucide-react'

type Driver = {
  id: string; code: string; name: string; kind: string
  metric: string | null; unit_label: string | null; is_active: boolean
  em_regras: number; em_bases: number
}
const KINDS: { v: string; l: string; hint: string }[] = [
  { v: 'VALUE', l: 'Por valor (base numérica)', hint: 'distribui proporcional à base por CC' },
  { v: 'MANUAL', l: 'Percentual manual', hint: 'pesos % definidos na regra' },
  { v: 'EQUAL', l: 'Divisão igual', hint: 'divide igualmente entre os CCs' },
  { v: 'DIRECT', l: 'Direto (100% em 1 CC)', hint: 'sem distribuição — sem unidade' },
]
const METRICS: { v: string; l: string }[] = [
  { v: 'QUANTIDADE', l: 'Quantidade' },
  { v: 'VALOR', l: 'Valor (R$)' },
  { v: 'HORA', l: 'Hora' },
  { v: 'PERCENTUAL', l: 'Percentual (%)' },
]
const kindLabel = (k: string) => KINDS.find(x => x.v === k)?.l || k
const emptyForm = { id: '', name: '', kind: 'VALUE', metric: 'QUANTIDADE', unit_label: '', is_active: true }

export default function DriversClient() {
  const [rows, setRows] = useState<Driver[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [q, setQ] = useState('')
  const [form, setForm] = useState<any>(null)   // null = fechado
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setErr('')
    try {
      const r = await fetch('/api/drivers'); const d = await r.json()
      if (Array.isArray(d)) setRows(d); else setErr(d?.error || 'Erro ao carregar.')
    } catch (e: any) { setErr(e?.message || 'Erro ao carregar.') }
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return rows
    return rows.filter(d => [d.name, d.code, kindLabel(d.kind), d.unit_label || ''].join(' ').toLowerCase().includes(t))
  }, [rows, q])

  async function save() {
    if (!form?.name?.trim()) { setMsg('Informe o nome.'); return }
    setSaving(true); setMsg('')
    const method = form.id ? 'PUT' : 'POST'
    const r = await fetch('/api/drivers', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    const d = await r.json().catch(() => ({}))
    setSaving(false)
    if (r.ok) { setForm(null); setMsg('Driver salvo.'); load() }
    else setMsg(d.error || 'Erro ao salvar.')
  }
  async function remove(d: Driver) {
    if (!confirm(`Apagar o driver "${d.name}"?`)) return
    const r = await fetch(`/api/drivers?id=${d.id}`, { method: 'DELETE' })
    const j = await r.json().catch(() => ({}))
    if (r.ok) { setMsg('Driver apagado.'); load() } else setMsg(j.error || 'Erro ao apagar.')
  }

  const isValue = form?.kind === 'VALUE'

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <Link href="/rateio" className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1 mb-1"><ArrowLeft className="w-3 h-3" /> Rateio</Link>
          <h1 className="page-title flex items-center gap-2"><Gauge className="w-5 h-5 text-blue-600" /> Drivers</h1>
          <p className="page-sub">Cadastro dos critérios de rateio. Cada driver tem um <b>tipo de cálculo</b> e, quando é “por valor”, uma <b>unidade de medida</b> (Licenças, Horas, R$…).</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="btn-secondary" disabled={loading}><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
          <button onClick={() => { setForm({ ...emptyForm }); setMsg('') }} className="btn-primary flex items-center gap-1.5"><Plus className="w-4 h-4" /> Novo driver</button>
        </div>
      </div>

      {msg && <div className="mb-3 flex items-center gap-2 px-4 py-2 rounded-lg text-sm bg-blue-50 text-blue-700"><Check className="w-4 h-4" /> {msg}</div>}
      {err && <div className="mb-3 flex items-center gap-2 px-4 py-2 rounded-lg text-sm bg-red-50 text-red-700"><AlertTriangle className="w-4 h-4" /> {err}</div>}

      {/* formulário */}
      {form && (
        <div className="card p-5 mb-4 border-blue-100">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-800">{form.id ? 'Editar driver' : 'Novo driver'}</h2>
            <button onClick={() => setForm(null)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><label className="label">Nome</label>
              <input className="input" value={form.name} placeholder="Ex.: Licenças Microsoft 365"
                onChange={e => setForm((f: any) => ({ ...f, name: e.target.value }))} />
            </div>
            <div><label className="label">Tipo de cálculo</label>
              <select className="input" value={form.kind} onChange={e => setForm((f: any) => ({ ...f, kind: e.target.value }))}>
                {KINDS.map(k => <option key={k.v} value={k.v}>{k.l}</option>)}
              </select>
              <p className="text-[11px] text-slate-400 mt-1">{KINDS.find(k => k.v === form.kind)?.hint}</p>
            </div>
            {isValue && (
              <>
                <div><label className="label">Métrica</label>
                  <select className="input" value={form.metric || 'QUANTIDADE'} onChange={e => setForm((f: any) => ({ ...f, metric: e.target.value }))}>
                    {METRICS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
                  </select>
                </div>
                <div><label className="label">Unidade de medida (rótulo)</label>
                  <input className="input" value={form.unit_label || ''} placeholder="Ex.: Licenças, Colaboradores, Horas, R$"
                    onChange={e => setForm((f: any) => ({ ...f, unit_label: e.target.value }))} />
                </div>
              </>
            )}
            <div className="flex items-center gap-2 pt-1">
              <input id="drv-active" type="checkbox" checked={!!form.is_active} onChange={e => setForm((f: any) => ({ ...f, is_active: e.target.checked }))} />
              <label htmlFor="drv-active" className="text-sm text-slate-600">Ativo</label>
            </div>
          </div>
          {!isValue && <p className="text-xs text-slate-400 mt-2">Este tipo de cálculo não usa unidade de medida.</p>}
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setForm(null)} className="btn-secondary text-sm">Cancelar</button>
            <button onClick={save} className="btn-primary text-sm" disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</button>
          </div>
        </div>
      )}

      {/* busca */}
      <div className="relative mb-3 max-w-sm">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input className="input pl-9" placeholder="Buscar driver…" value={q} onChange={e => setQ(e.target.value)} />
      </div>
      <div className="text-xs text-slate-400 mb-2">{shown.length} de {rows.length} driver(s)</div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="tbl w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-[11px] uppercase text-slate-500">
                <th className="text-left px-3 py-2.5">Driver</th>
                <th className="text-left px-3 py-2.5">Tipo de cálculo</th>
                <th className="text-left px-3 py-2.5">Unidade de medida</th>
                <th className="text-right px-3 py-2.5">Em uso</th>
                <th className="text-center px-3 py-2.5">Ativo</th>
                <th className="text-right px-3 py-2.5">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {!loading && shown.length === 0 && <tr><td colSpan={6} className="px-3 py-10 text-center text-slate-400">Nenhum driver.</td></tr>}
              {shown.map(d => (
                <tr key={d.id} className={`hover:bg-slate-50 ${!d.is_active ? 'opacity-50' : ''}`}>
                  <td className="px-3 py-2.5 text-slate-800">{d.name} <span className="font-mono text-[11px] text-slate-400">{d.code}</span></td>
                  <td className="px-3 py-2.5 text-slate-600 text-xs">{kindLabel(d.kind)}</td>
                  <td className="px-3 py-2.5 text-slate-600">
                    {d.kind === 'VALUE'
                      ? <span>{d.unit_label || <span className="text-amber-600">— definir —</span>} <span className="text-[11px] text-slate-400">({(METRICS.find(m => m.v === d.metric)?.l) || d.metric || '—'})</span></span>
                      : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs text-slate-500 tabular-nums">{d.em_regras}r · {d.em_bases}b</td>
                  <td className="px-3 py-2.5 text-center">{d.is_active ? '🟢' : '⚪'}</td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    <button onClick={() => { setForm({ id: d.id, name: d.name, kind: d.kind, metric: d.metric || 'QUANTIDADE', unit_label: d.unit_label || '', is_active: d.is_active }); setMsg('') }}
                      className="text-slate-400 hover:text-blue-600 p-1" title="Editar"><Pencil className="w-4 h-4" /></button>
                    <button onClick={() => remove(d)} className="text-slate-400 hover:text-red-600 p-1" title="Apagar"><Trash2 className="w-4 h-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {loading && <div className="text-sm text-slate-400 py-8 text-center">Carregando…</div>}
    </div>
  )
}
