'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { RefreshCw, Plus, Pencil, X, Search } from 'lucide-react'
import clsx from 'clsx'

interface Opt { id: string; code?: string; name: string; platform_id?: string; country_id?: string }
interface User {
  id: string; email: string; full_name: string | null; role: string
  platform_id: string | null; country_id: string | null; unit_id: string | null
  platform_name: string | null; country_name: string | null; unit_code: string | null
  country_ids?: string[]
  is_active: boolean
}

const ROLES = [
  { value: 'admin', label: 'Admin (tudo)' },
  { value: 'diretor', label: 'Diretor (leitura global)' },
  { value: 'gerente', label: 'Gerente (fornecimento + budget + fechamento)' },
  { value: 'analista', label: 'Analista (fornecimento + lançar)' },
  { value: 'lancador', label: 'Lançador (só Ordem de pagamento)' },
  { value: 'unit_viewer', label: 'Viewer País' },
  { value: 'multi_country', label: 'Multi-País' },
]
const chip = (cls: string, txt: string) => <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${cls}`}>{txt}</span>
const roleBadge = (r: string) =>
  r === 'admin' ? <span className="badge-yellow">Admin</span>
  : r === 'diretor' ? chip('bg-violet-50 text-violet-700', 'Diretor')
  : r === 'gerente' ? chip('bg-teal-50 text-teal-700', 'Gerente')
  : r === 'analista' ? chip('bg-sky-50 text-sky-700', 'Analista')
  : r === 'lancador' ? <span className="badge-blue">Lançador</span>
  : r === 'multi_country' ? <span className="badge-navy">Multi-País</span>
  : <span className="badge-gray">Viewer</span>

const empty = { id: '', email: '', full_name: '', password: '', role: 'unit_viewer', platform_id: '', country_id: '', unit_id: '', country_ids: [] as string[], is_active: true }

export default function UsersClient({ platforms, countries, units }: { platforms: Opt[]; countries: Opt[]; units: Opt[] }) {
  const [users, setUsers] = useState<User[]>([])
  const [q, setQ] = useState('')
  const nq = (s: any) => String(s ?? '').toLowerCase()
  const shown = q.trim() ? users.filter((u: any) => [u.full_name, u.email, u.role].some(v => nq(v).includes(nq(q)))) : users
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState<any>({ ...empty })
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const editing = !!form.id

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/users'); const data = await res.json()
    setUsers(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  // cascata
  const countryOpts = useMemo(() => (countries || []).filter(c => !form.platform_id || c.platform_id === form.platform_id), [countries, form.platform_id])

  function set(k: string, v: string) {
    setForm((f: any) => {
      const nf = { ...f, [k]: v }
      if (k === 'platform_id') { nf.country_id = ''; nf.unit_id = ''; nf.country_ids = [] }
      if (k === 'country_id') { nf.unit_id = '' }
      return nf
    })
  }
  const toggleCountry = (id: string) => setForm((f: any) => ({
    ...f, country_ids: (f.country_ids || []).includes(id) ? f.country_ids.filter((x: string) => x !== id) : [...(f.country_ids || []), id],
  }))
  const reset = () => { setForm({ ...empty }); setMsg('') }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setMsg('')
    const country_ids = form.role === 'multi_country' ? (form.country_ids || []) : []
    const body: any = editing
      ? { id: form.id, full_name: form.full_name, role: form.role, platform_id: form.platform_id, country_id: form.country_id, unit_id: form.unit_id, country_ids, is_active: form.is_active }
      : { create: true, email: form.email, full_name: form.full_name, password: form.password, role: form.role, platform_id: form.platform_id, country_id: form.country_id, unit_id: form.unit_id, country_ids }
    if (form.password) body.password = form.password
    if (!editing && (!form.email || !form.password)) { setMsg('Erro: e-mail e senha são obrigatórios.'); setSaving(false); return }
    const res = await fetch('/api/admin/users', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const d = await res.json().catch(() => ({}))
    if (res.ok) { reset(); await load(); setMsg(editing ? 'Usuário atualizado.' : 'Usuário criado.') }
    else setMsg(d.error || 'Erro ao salvar.')
    setSaving(false)
  }

  function edit(u: User) {
    setForm({
      id: u.id, email: u.email, full_name: u.full_name ?? '', password: '', role: u.role,
      platform_id: u.platform_id ?? '', country_id: u.country_id ?? '', unit_id: u.unit_id ?? '', country_ids: u.country_ids ?? [], is_active: u.is_active,
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="page">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="page-title">Usuários</h1>
          <p className="text-sm text-slate-500">Acesso por plataforma e país</p>
        </div>
        <button onClick={load} className="btn-secondary" disabled={loading}><RefreshCw className={clsx('w-4 h-4', loading && 'animate-spin')} /></button>
      </div>

      {msg && <div className={clsx('mb-4 px-4 py-2 rounded-lg text-sm', msg.startsWith('Erro') ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700')}>{msg}</div>}

      <form onSubmit={submit} className="card p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-800">{editing ? `Editar — ${form.email}` : 'Novo usuário'}</h2>
          {editing && <button type="button" onClick={reset} className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1"><X className="w-3.5 h-3.5" /> cancelar edição</button>}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="label">E-mail {editing ? '' : '*'}</label>
            <input type="email" className="input" value={form.email} disabled={editing} onChange={e => set('email', e.target.value)} />
          </div>
          <div>
            <label className="label">Nome</label>
            <input className="input" value={form.full_name} onChange={e => set('full_name', e.target.value)} />
          </div>
          <div>
            <label className="label">Senha {editing ? '(deixe vazio p/ manter)' : '*'}</label>
            <input type="password" className="input" value={form.password} onChange={e => set('password', e.target.value)} minLength={6} placeholder={editing ? '••••••' : ''} />
          </div>
          <div>
            <label className="label">Perfil</label>
            <select className="input" value={form.role} onChange={e => set('role', e.target.value)}>
              {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Plataforma</label>
            <select className="input" value={form.platform_id} onChange={e => set('platform_id', e.target.value)}>
              <option value="">—</option>
              {platforms.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          {form.role === 'multi_country' ? (
            <div className="md:col-span-2">
              <label className="label">Países <span className="text-slate-400 font-normal">({(form.country_ids || []).length} selecionado(s))</span></label>
              {!form.platform_id
                ? <p className="text-xs text-amber-600">Selecione a plataforma para listar os países.</p>
                : (
                  <div className="flex flex-wrap gap-2 mt-1">
                    {countryOpts.map(c => {
                      const on = (form.country_ids || []).includes(c.id)
                      return (
                        <button type="button" key={c.id} onClick={() => toggleCountry(c.id)}
                          className={clsx('px-2.5 py-1 rounded-full text-xs border transition-colors',
                            on ? 'bg-navy-700 text-white border-navy-700' : 'border-slate-300 text-slate-600 hover:border-slate-400')}>
                          {c.name}
                        </button>
                      )
                    })}
                    {countryOpts.length === 0 && <span className="text-xs text-slate-400">Nenhum país nesta plataforma.</span>}
                  </div>
                )}
            </div>
          ) : (
            <div>
              <label className="label">País</label>
              <select className="input" value={form.country_id} onChange={e => set('country_id', e.target.value)}>
                <option value="">—</option>
                {countryOpts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          {editing && (
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={!!form.is_active} onChange={e => setForm((f: any) => ({ ...f, is_active: e.target.checked }))} className="w-4 h-4 rounded" />
                Ativo
              </label>
            </div>
          )}
        </div>
        <div className="flex justify-end mt-4">
          <button className="btn-primary flex items-center gap-1.5" disabled={saving}>
            <Plus className="w-4 h-4" /> {saving ? 'Salvando…' : editing ? 'Salvar alterações' : 'Criar usuário'}
          </button>
        </div>
      </form>

      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input className="input pl-9" placeholder="Buscar usuário…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <span className="text-xs text-slate-400">{shown.length} de {users.length}</span>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="tbl w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-100">
                <th className="text-left px-4 py-3 font-medium">E-mail</th>
                <th className="text-left px-4 py-3 font-medium">Nome</th>
                <th className="text-left px-4 py-3 font-medium">Perfil</th>
                <th className="text-left px-4 py-3 font-medium">Plataforma</th>
                <th className="text-left px-4 py-3 font-medium">País</th>
                <th className="text-center px-4 py-3 font-medium">Ativo</th>
                <th className="px-4 py-3 w-12" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {shown.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-400">{loading ? 'Carregando…' : q.trim() ? 'Nada encontrado' : 'Nenhum usuário'}</td></tr>}
              {shown.map(u => (
                <tr key={u.id} className={clsx('hover:bg-slate-50', !u.is_active && 'opacity-50')}>
                  <td className="px-4 py-2.5 text-slate-600 text-xs">{u.email}</td>
                  <td className="px-4 py-2.5 text-slate-800">{u.full_name ?? '—'}</td>
                  <td className="px-4 py-2.5">{roleBadge(u.role)}</td>
                  <td className="px-4 py-2.5 text-slate-600 text-xs">{u.platform_name ?? '—'}</td>
                  <td className="px-4 py-2.5 text-slate-600 text-xs">{u.country_name ?? '—'}</td>
                  <td className="px-4 py-2.5 text-center"><span className={u.is_active ? 'badge-green' : 'badge-gray'}>{u.is_active ? 'Sim' : 'Não'}</span></td>
                  <td className="px-4 py-2.5 text-right">
                    <button onClick={() => edit(u)} className="p-1 text-slate-400 hover:text-blue-600"><Pencil className="w-4 h-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
