'use client'
import { useEffect, useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, Search, X, HardDrive } from 'lucide-react'

interface Group { id: string; code: string; name: string }
interface Unidade { id: string; code: string; name: string }
interface Asset {
  id: string; asset_group_id: string; unidade_id: string; name: string | null; subtype: string | null
  manufacturer: string | null; model: string | null; serial_number: string | null; asset_tag: string | null
  os: string | null; status: string; notes: string | null
  group_name: string; unidade_code: string; unidade_name: string; country_name: string | null; platform_name: string | null
}

const STATUS: { v: string; label: string; cls: string }[] = [
  { v: 'EM_USO', label: 'Em uso', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { v: 'ESTOQUE', label: 'Estoque', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  { v: 'MANUTENCAO', label: 'Manutenção', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  { v: 'BAIXADO', label: 'Baixado', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
]
const statusMeta = (v: string) => STATUS.find(s => s.v === v) || STATUS[0]

const empty = {
  id: '', asset_group_id: '', unidade_id: '', name: '', subtype: '', manufacturer: '', model: '',
  serial_number: '', asset_tag: '', os: '', status: 'EM_USO', notes: '',
}

export default function AssetsClient({ groups, unidades }: { groups: Group[]; unidades: Unidade[] }) {
  const [rows, setRows] = useState<Asset[]>([])
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
    const res = await fetch('/api/inventory/assets?' + p.toString())
    setRows(res.ok ? await res.json() : [])
    setLoading(false)
  }
  useEffect(() => { load() }, [fGroup, fUnidade])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return rows
    return rows.filter(r => [r.asset_tag, r.serial_number, r.model, r.name, r.manufacturer, r.group_name, r.unidade_name]
      .some(v => (v || '').toLowerCase().includes(s)))
  }, [rows, q])

  function openNew() { setForm({ ...empty, asset_group_id: groups[0]?.id || '', unidade_id: unidades[0]?.id || '' }); setEditing(true); setError('') }
  function openEdit(a: Asset) {
    setForm({
      id: a.id, asset_group_id: a.asset_group_id, unidade_id: a.unidade_id, name: a.name || '', subtype: a.subtype || '',
      manufacturer: a.manufacturer || '', model: a.model || '', serial_number: a.serial_number || '',
      asset_tag: a.asset_tag || '', os: a.os || '', status: a.status, notes: a.notes || '',
    })
    setEditing(true); setError('')
  }
  function close() { setEditing(false); setForm(empty); setError('') }
  const set = (k: keyof typeof empty, v: string) => setForm(f => ({ ...f, [k]: v }))

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!form.asset_group_id || !form.unidade_id) { setError('Grupo e unidade são obrigatórios.'); return }
    setSaving(true); setError('')
    const method = form.id ? 'PATCH' : 'POST'
    const res = await fetch('/api/inventory/assets', {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
    })
    const data = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { setError(data.error || 'Erro ao salvar.'); return }
    close(); load()
  }

  async function remove(a: Asset) {
    if (!confirm(`Excluir o ativo ${a.asset_tag || a.model || a.serial_number || ''}?`)) return
    const res = await fetch('/api/inventory/assets', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: a.id }),
    })
    if (res.ok) load(); else { const d = await res.json().catch(() => ({})); alert(d.error || 'Erro ao excluir.') }
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-navy-50 text-navy-700"><HardDrive className="h-5 w-5" /></span>
          <div>
            <h1 className="text-xl font-semibold text-navy-800">Inventário — Ativos (Hardware)</h1>
            <p className="text-sm text-slate-500">Servidores, estações, rede, dispositivos móveis e periféricos por unidade.</p>
          </div>
        </div>
        <button onClick={openNew} className="btn-navy"><Plus className="h-4 w-4" /> Adicionar ativo</button>
      </div>

      {/* Filtros */}
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
            <input className="input pl-10" placeholder="Patrimônio, série, modelo…" value={q} onChange={e => setQ(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Formulário */}
      {editing && (
        <form onSubmit={save} className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-navy-800">{form.id ? 'Editar ativo' : 'Novo ativo'}</h2>
            <button type="button" onClick={close} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="label">Grupo *</label>
              <select className="input" value={form.asset_group_id} onChange={e => set('asset_group_id', e.target.value)} required>
                {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Unidade *</label>
              <select className="input" value={form.unidade_id} onChange={e => set('unidade_id', e.target.value)} required>
                <option value="">Selecione…</option>
                {unidades.map(u => <option key={u.id} value={u.id}>{u.code} — {u.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input" value={form.status} onChange={e => set('status', e.target.value)}>
                {STATUS.map(s => <option key={s.v} value={s.v}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Tipo / subclasse</label>
              <input className="input" placeholder="Desktop, Notebook, Switch…" value={form.subtype} onChange={e => set('subtype', e.target.value)} />
            </div>
            <div>
              <label className="label">Fabricante</label>
              <input className="input" placeholder="Dell, HP, Cisco…" value={form.manufacturer} onChange={e => set('manufacturer', e.target.value)} />
            </div>
            <div>
              <label className="label">Modelo</label>
              <input className="input" value={form.model} onChange={e => set('model', e.target.value)} />
            </div>
            <div>
              <label className="label">Número de série</label>
              <input className="input" value={form.serial_number} onChange={e => set('serial_number', e.target.value)} />
            </div>
            <div>
              <label className="label">Patrimônio</label>
              <input className="input" value={form.asset_tag} onChange={e => set('asset_tag', e.target.value)} />
            </div>
            <div>
              <label className="label">Sistema operacional</label>
              <input className="input" placeholder="Windows Server 2022…" value={form.os} onChange={e => set('os', e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <label className="label">Descrição / hostname</label>
              <input className="input" value={form.name} onChange={e => set('name', e.target.value)} />
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

      {/* Tabela */}
      <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Patrimônio</th>
              <th className="px-4 py-3">Grupo</th>
              <th className="px-4 py-3">Descrição / Modelo</th>
              <th className="px-4 py-3">Nº série</th>
              <th className="px-4 py-3">Unidade</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">Carregando…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">Nenhum ativo cadastrado.</td></tr>
            ) : filtered.map(a => {
              const st = statusMeta(a.status)
              return (
                <tr key={a.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                  <td className="px-4 py-3 font-medium text-navy-800">{a.asset_tag || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{a.group_name}</td>
                  <td className="px-4 py-3 text-slate-700">{[a.manufacturer, a.model].filter(Boolean).join(' ') || a.name || '—'}</td>
                  <td className="px-4 py-3 text-slate-500">{a.serial_number || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{a.unidade_code}</td>
                  <td className="px-4 py-3"><span className={'inline-block rounded-full border px-2 py-0.5 text-xs ' + st.cls}>{st.label}</span></td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => openEdit(a)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-navy-700" title="Editar"><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => remove(a)} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Excluir"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-400">{filtered.length} ativo(s)</p>
    </div>
  )
}
