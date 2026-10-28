'use client'
import { useEffect, useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, Search, X, KeyRound, AlertTriangle } from 'lucide-react'

interface Group { id: string; code: string; name: string }
interface Unidade { id: string; code: string; name: string }
interface License {
  id: string; asset_group_id: string; unidade_id: string | null; product: string; vendor: string | null
  license_type: string | null; metric: string | null; seats: number | null; seats_used: number | null
  start_date: string | null; expiry_date: string | null; notes: string | null
  group_name: string; unidade_code: string | null; unidade_name: string | null
}

const TYPES = [{ v: 'PERPETUA', label: 'Perpétua' }, { v: 'SUBSCRIPTION', label: 'Subscrição' }, { v: 'SAAS', label: 'SaaS' }]
const METRICS = [{ v: 'USUARIO', label: 'Por usuário' }, { v: 'DISPOSITIVO', label: 'Por dispositivo' }, { v: 'CORE', label: 'Por core' }]
const typeLabel = (v: string | null) => TYPES.find(t => t.v === v)?.label || '—'

const empty = {
  id: '', asset_group_id: '', unidade_id: '', product: '', vendor: '', license_type: 'SUBSCRIPTION',
  metric: 'USUARIO', seats: '', seats_used: '', start_date: '', expiry_date: '', notes: '',
}

// Vencida (vermelho) ou a vencer em <=60 dias (âmbar)
function expiryFlag(d: string | null): 'ok' | 'soon' | 'late' | null {
  if (!d) return null
  const diff = (new Date(d).getTime() - Date.now()) / 86400000
  if (diff < 0) return 'late'
  if (diff <= 60) return 'soon'
  return 'ok'
}

export default function LicensesClient({ groups, unidades, isGlobal }: { groups: Group[]; unidades: Unidade[]; isGlobal: boolean }) {
  const [rows, setRows] = useState<License[]>([])
  const [loading, setLoading] = useState(true)
  const [fGroup, setFGroup] = useState('')
  const [fUnidade, setFUnidade] = useState('')
  const [q, setQ] = useState('')
  const [form, setForm] = useState<typeof empty>(empty)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    const p = new URLSearchParams()
    if (fGroup) p.set('group_id', fGroup)
    if (fUnidade) p.set('unidade_id', fUnidade)
    const res = await fetch('/api/inventory/licenses?' + p.toString())
    setRows(res.ok ? await res.json() : [])
    setLoading(false)
  }
  useEffect(() => { load() }, [fGroup, fUnidade])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return rows
    return rows.filter(r => [r.product, r.vendor, r.group_name, r.unidade_name].some(v => (v || '').toLowerCase().includes(s)))
  }, [rows, q])

  function openNew() { setForm({ ...empty, asset_group_id: groups[0]?.id || '', unidade_id: isGlobal ? '' : (unidades[0]?.id || '') }); setEditing(true); setError('') }
  function openEdit(l: License) {
    setForm({
      id: l.id, asset_group_id: l.asset_group_id, unidade_id: l.unidade_id || '', product: l.product, vendor: l.vendor || '',
      license_type: l.license_type || 'SUBSCRIPTION', metric: l.metric || 'USUARIO',
      seats: l.seats != null ? String(l.seats) : '', seats_used: l.seats_used != null ? String(l.seats_used) : '',
      start_date: l.start_date ? l.start_date.slice(0, 10) : '', expiry_date: l.expiry_date ? l.expiry_date.slice(0, 10) : '', notes: l.notes || '',
    })
    setEditing(true); setError('')
  }
  function close() { setEditing(false); setForm(empty); setError('') }
  const set = (k: keyof typeof empty, v: string) => setForm(f => ({ ...f, [k]: v }))

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!form.asset_group_id || !form.product) { setError('Grupo e produto são obrigatórios.'); return }
    setSaving(true); setError('')
    const payload: any = {
      ...form,
      unidade_id: form.unidade_id || null,
      seats: form.seats === '' ? null : Number(form.seats),
      seats_used: form.seats_used === '' ? null : Number(form.seats_used),
    }
    const method = form.id ? 'PATCH' : 'POST'
    const res = await fetch('/api/inventory/licenses', {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    })
    const data = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { setError(data.error || 'Erro ao salvar.'); return }
    close(); load()
  }

  async function remove(l: License) {
    if (!confirm(`Excluir a licença ${l.product}?`)) return
    const res = await fetch('/api/inventory/licenses', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: l.id }),
    })
    if (res.ok) load(); else { const d = await res.json().catch(() => ({})); alert(d.error || 'Erro ao excluir.') }
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-navy-50 text-navy-700"><KeyRound className="h-5 w-5" /></span>
          <div>
            <h1 className="text-xl font-semibold text-navy-800">Inventário — Licenças (Software)</h1>
            <p className="text-sm text-slate-500">Sistema operacional, Microsoft, segurança (EDR) e aplicações, por assentos/usuários.</p>
          </div>
        </div>
        <button onClick={openNew} className="btn-navy"><Plus className="h-4 w-4" /> Adicionar licença</button>
      </div>

      <div className="mt-5 flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Grupo</label>
          <select className="input min-w-[180px]" value={fGroup} onChange={e => setFGroup(e.target.value)}>
            <option value="">Todos</option>
            {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Unidade</label>
          <select className="input min-w-[180px]" value={fUnidade} onChange={e => setFUnidade(e.target.value)}>
            <option value="">Todas</option>
            {unidades.map(u => <option key={u.id} value={u.id}>{u.code} — {u.name}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="label">Busca</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className="input pl-10" placeholder="Produto, fornecedor…" value={q} onChange={e => setQ(e.target.value)} />
          </div>
        </div>
      </div>

      {editing && (
        <form onSubmit={save} className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-navy-800">{form.id ? 'Editar licença' : 'Nova licença'}</h2>
            <button type="button" onClick={close} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="label">Grupo *</label>
              <select className="input" value={form.asset_group_id} onChange={e => set('asset_group_id', e.target.value)} required>
                {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="label">Produto *</label>
              <input className="input" placeholder="Microsoft 365 E3, CrowdStrike Falcon…" value={form.product} onChange={e => set('product', e.target.value)} required />
            </div>
            <div>
              <label className="label">Fornecedor / fabricante</label>
              <input className="input" value={form.vendor} onChange={e => set('vendor', e.target.value)} />
            </div>
            <div>
              <label className="label">Tipo</label>
              <select className="input" value={form.license_type} onChange={e => set('license_type', e.target.value)}>
                {TYPES.map(t => <option key={t.v} value={t.v}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Métrica</label>
              <select className="input" value={form.metric} onChange={e => set('metric', e.target.value)}>
                {METRICS.map(m => <option key={m.v} value={m.v}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Qtd. contratada (assentos)</label>
              <input className="input" type="number" min="0" value={form.seats} onChange={e => set('seats', e.target.value)} />
            </div>
            <div>
              <label className="label">Qtd. utilizada</label>
              <input className="input" type="number" min="0" value={form.seats_used} onChange={e => set('seats_used', e.target.value)} />
            </div>
            <div>
              <label className="label">Unidade {isGlobal && <span className="text-slate-400">(vazio = corporativa)</span>}</label>
              <select className="input" value={form.unidade_id} onChange={e => set('unidade_id', e.target.value)}>
                {isGlobal && <option value="">Corporativa (global)</option>}
                {!isGlobal && <option value="">Selecione…</option>}
                {unidades.map(u => <option key={u.id} value={u.id}>{u.code} — {u.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Início</label>
              <input className="input" type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} />
            </div>
            <div>
              <label className="label">Validade / renovação</label>
              <input className="input" type="date" value={form.expiry_date} onChange={e => set('expiry_date', e.target.value)} />
            </div>
            <div className="md:col-span-3">
              <label className="label">Observações</label>
              <input className="input" value={form.notes} onChange={e => set('notes', e.target.value)} />
            </div>
          </div>
          {error && <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
          <div className="mt-5 flex gap-2">
            <button type="submit" disabled={saving} className="btn-navy">{saving ? 'Salvando…' : 'Salvar'}</button>
            <button type="button" onClick={close} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">Cancelar</button>
          </div>
        </form>
      )}

      <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Produto</th>
              <th className="px-4 py-3">Grupo</th>
              <th className="px-4 py-3">Fornecedor</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Assentos</th>
              <th className="px-4 py-3">Unidade</th>
              <th className="px-4 py-3">Validade</th>
              <th className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">Carregando…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">Nenhuma licença cadastrada.</td></tr>
            ) : filtered.map(l => {
              const flag = expiryFlag(l.expiry_date)
              const over = l.seats != null && l.seats_used != null && l.seats_used > l.seats
              return (
                <tr key={l.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                  <td className="px-4 py-3 font-medium text-navy-800">{l.product}</td>
                  <td className="px-4 py-3 text-slate-600">{l.group_name}</td>
                  <td className="px-4 py-3 text-slate-600">{l.vendor || '—'}</td>
                  <td className="px-4 py-3 text-slate-500">{typeLabel(l.license_type)}</td>
                  <td className="px-4 py-3">
                    {l.seats != null ? (
                      <span className={over ? 'text-rose-600 font-medium inline-flex items-center gap-1' : 'text-slate-600'}>
                        {over && <AlertTriangle className="h-3.5 w-3.5" />}{l.seats_used ?? 0}/{l.seats}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{l.unidade_code || <span className="text-slate-400">Corporativa</span>}</td>
                  <td className="px-4 py-3">
                    {l.expiry_date ? (
                      <span className={
                        flag === 'late' ? 'text-rose-600 font-medium' : flag === 'soon' ? 'text-amber-600 font-medium' : 'text-slate-500'
                      }>{l.expiry_date.slice(0, 10)}</span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => openEdit(l)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-navy-700" title="Editar"><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => remove(l)} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Excluir"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-400">{filtered.length} licença(s)</p>
    </div>
  )
}
