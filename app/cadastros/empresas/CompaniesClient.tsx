'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { Pencil, Trash2, Plus, Upload, Download, Building, X, Search } from 'lucide-react'
import { readMatrix } from '@/lib/csv'
import GuideCard from '@/components/GuideCard'

interface Opt { id: string; code: string; name: string }
const empty = { id: '', code: '', name: '', divisao_id: '', divisao_nome: '', unidade_id: '', cidade: '', country_id: '', cost_center_ids: [] as string[] }

const stripAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
const normH = (s: string) => stripAccents(String(s || '')).toLowerCase().replace(/[\s_().-]+/g, '')

export default function CompaniesClient({ countries, costCenters, unidades }: { countries: Opt[]; costCenters: Opt[]; unidades: Opt[] }) {
  const [list, setList] = useState<any[]>([])
  const [q, setQ] = useState('')
  const nq = (s: any) => String(s ?? '').toLowerCase()
  const shown = q.trim() ? list.filter((c: any) => [c.code, c.name, c.unidade_nome, c.divisao_nome, c.country_name, c.city].some(v => nq(v).includes(nq(q)))) : list
  const [form, setForm] = useState<any>({ ...empty })
  const [err, setErr] = useState(''); const [msg, setMsg] = useState(''); const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))
  const toggleCC = (id: string) => setForm((f: any) => ({ ...f, cost_center_ids: f.cost_center_ids.includes(id) ? f.cost_center_ids.filter((x: string) => x !== id) : [...f.cost_center_ids, id] }))

  const load = useCallback(async () => { const r = await fetch('/api/companies'); const d = await r.json(); setList(Array.isArray(d) ? d : []) }, [])
  useEffect(() => { load() }, [load])

  function edit(c: any) {
    setForm({ id: c.id, code: c.code, name: c.name, divisao_id: c.divisao_id ?? '', divisao_nome: c.divisao_nome ?? '', unidade_id: c.unidade_id ?? '', cidade: c.cidade ?? '', country_id: c.country_id ?? '', cost_center_ids: c.cost_center_ids ?? [] })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const reset = () => { setForm({ ...empty, cost_center_ids: [] }); setErr('') }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!form.code || !form.name) { setErr('Empresa (ID) e Descrição são obrigatórios.'); return }
    setSaving(true); setErr('')
    const res = await fetch('/api/companies', { method: form.id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    const d = await res.json().catch(() => ({})); setSaving(false)
    if (res.ok) { reset(); load(); setMsg('Salvo.') } else setErr(d.error || 'Erro ao salvar.')
  }
  async function del(id: string) { if (!confirm('Excluir empresa?')) return; await fetch('/api/companies', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }); load() }

  function downloadTemplate() {
    const header = 'EMPRESA (ID),EMPRESA (Descrição PT),DIVISÃO (ID),DIVISÃO,Unidade,Cidade,País'
    const body = 'O311,Martini Meat (Armazem),CG,AZ - Carga Geral,Paranaguá AZ-CG,Paranaguá,Brasil'
    const blob = new Blob(['﻿' + header + '\r\n' + body], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'modelo_empresa.csv'; a.click(); URL.revokeObjectURL(a.href)
  }

  async function handleCSV(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setMsg(''); setErr('')
    const matrix = await readMatrix(file)
    if (!matrix.length) { setErr('Arquivo vazio ou ilegível.'); e.target.value = ''; return }
    const H = matrix[0].map(normH)
    const idx = (...k: string[]) => H.findIndex(h => k.some(x => h.includes(x)))
    const iId = idx('empresaid'), iN = idx('empresadescricao', 'empresa'), iDid = idx('divisaoid'), iDn = idx('divisaodescricao', 'divisao'), iU = idx('unidade'), iC = idx('cidade'), iP = idx('pais')
    const rows = matrix.slice(1).map(f => ({ code: (f[iId] || '').trim(), name: (f[iN] || '').trim(), divisao_id: (f[iDid] || '').trim(), divisao_nome: (f[iDn] || '').trim(), unidade: (f[iU] || '').trim(), cidade: (f[iC] || '').trim(), pais: (f[iP] || '').trim() })).filter(r => r.code && r.name)
    if (!rows.length) { setErr('Nenhuma linha válida no CSV.'); e.target.value = ''; return }
    const res = await fetch('/api/companies', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows }) })
    const dd = await res.json().catch(() => ({}))
    if (res.ok) { setMsg(`Importado: ${dd.saved ?? rows.length} empresa(s)${dd.errors ? `, ${dd.errors} com erro` : ''}.`); load() } else setErr(dd.error || 'Erro ao importar.')
    e.target.value = ''
  }

  return (
    <div className="page space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title flex items-center gap-2"><Building className="w-5 h-5 text-blue-600" /> Empresas</h1>
          <p className="text-sm text-slate-500">Empresa, Divisão, Unidade, Cidade, País — e associação de um ou mais Centros de Custo.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={downloadTemplate} className="btn-secondary text-sm flex items-center gap-1.5"><Download className="w-4 h-4" /> Baixar modelo</button>
          <label className="btn-primary text-sm flex items-center gap-1.5 cursor-pointer"><Upload className="w-4 h-4" /> Importar CSV/XLSX
            <input ref={fileRef} type="file" accept=".csv,.txt,.xlsx,.xls" className="hidden" onChange={handleCSV} /></label>
        </div>
      </div>

      <GuideCard storageKey="/cadastros/empresas"
        steps={[
          'Informe Empresa, Divisão, Unidade, Cidade e País.',
          'Associe um ou mais Centros de Custo à empresa.',
          'Para carga inicial, baixe o modelo e use Importar CSV/XLSX.',
        ]}
        note="Cadastre antes País e Centro de Custo, que são referenciados aqui." />

      {msg && <div className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-4 py-3 rounded-lg text-sm font-medium">{msg}</div>}
      {err && <div className="bg-red-50 text-red-700 border border-red-200 px-4 py-3 rounded-lg text-sm font-medium">{err}</div>}

      <form onSubmit={save} className="card p-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div><label className="label">Empresa (ID) *</label><input className="input font-mono" value={form.code} onChange={e => set('code', e.target.value)} /></div>
          <div className="md:col-span-2"><label className="label">Empresa (Descrição PT) *</label><input className="input" value={form.name} onChange={e => set('name', e.target.value)} /></div>
          <div><label className="label">Divisão (ID)</label><input className="input font-mono" value={form.divisao_id} onChange={e => set('divisao_id', e.target.value)} /></div>
          <div><label className="label">Divisão (Descrição)</label><input className="input" value={form.divisao_nome} onChange={e => set('divisao_nome', e.target.value)} /></div>
          <div><label className="label">País</label>
            <select className="input" value={form.country_id} onChange={e => set('country_id', e.target.value)}>
              <option value="">—</option>{countries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div><label className="label">Unidade</label>
            <select className="input" value={form.unidade_id} onChange={e => set('unidade_id', e.target.value)}>
              <option value="">—</option>{unidades.map(u => <option key={u.id} value={u.id}>{u.code} — {u.name}</option>)}
            </select>
          </div>
          <div><label className="label">Cidade</label><input className="input" value={form.cidade} onChange={e => set('cidade', e.target.value)} /></div>
        </div>

        <div className="mt-4 md:max-w-md">
          <label className="label">Centros de Custo associados <span className="text-slate-400 font-normal">({form.cost_center_ids.length})</span></label>
          <select className="input" value="" onChange={e => { if (e.target.value) toggleCC(e.target.value); e.currentTarget.value = '' }}>
            <option value="">Selecione para associar…</option>
            {costCenters.filter(cc => !form.cost_center_ids.includes(cc.id)).map(cc => <option key={cc.id} value={cc.id}>{cc.code} — {cc.name}</option>)}
          </select>
          {form.cost_center_ids.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {form.cost_center_ids.map((id: string) => {
                const cc = costCenters.find(x => x.id === id)
                return (
                  <span key={id} className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-full pl-2 pr-1 py-0.5">
                    <span className="font-mono">{cc?.code ?? '?'}</span>
                    <button type="button" onClick={() => toggleCC(id)} className="hover:text-blue-900"><X className="w-3 h-3" /></button>
                  </span>
                )
              })}
            </div>
          )}
        </div>

        
        <div className="flex items-center gap-2 mt-4">
          <button type="submit" className="btn-primary flex items-center gap-1.5" disabled={saving}>{form.id ? <><Pencil className="w-4 h-4" /> Atualizar</> : <><Plus className="w-4 h-4" /> Adicionar</>}</button>
          {form.id && <button type="button" className="btn-secondary" onClick={reset}><X className="w-4 h-4" /> Cancelar</button>}
        </div>
      </form>

      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-sm font-semibold text-slate-800">Empresas ({shown.length}{shown.length !== list.length ? ` de ${list.length}` : ''})</h2>
          <div className="relative w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input className="input h-8 text-sm pl-9" placeholder="Buscar empresa…" value={q} onChange={e => setQ(e.target.value)} />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="tbl w-full text-sm">
            <thead><tr className="text-xs text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-100">
              <th className="text-left px-3 py-2.5 font-medium">Empresa (ID)</th><th className="text-left px-3 py-2.5 font-medium">Descrição PT</th>
              <th className="text-left px-3 py-2.5 font-medium">Divisão</th><th className="text-left px-3 py-2.5 font-medium">Unidade</th>
              <th className="text-left px-3 py-2.5 font-medium">Cidade</th><th className="text-left px-3 py-2.5 font-medium">País</th>
              <th className="text-center px-3 py-2.5 font-medium">CCs</th><th className="px-3 py-2.5" />
            </tr></thead>
            <tbody className="divide-y divide-slate-50">
              {shown.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center">{q.trim() ? <span className="text-slate-400">Nada encontrado</span> : <div className="text-slate-500 max-w-md mx-auto"><p className="font-semibold text-slate-700">Você ainda não tem empresas</p><p className="text-sm mt-1">A empresa é a entidade legal do grupo. O centro de custo referencia uma empresa. Ex.: Emergent Cold Brasil Ltda.</p><p className="text-xs text-slate-400 mt-2">Cadastre a primeira no formulário acima.</p></div>}</td></tr>}
              {shown.map(c => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2 font-mono text-xs text-slate-600">{c.code}</td>
                  <td className="px-3 py-2 text-slate-700">{c.name}</td>
                  <td className="px-3 py-2 text-slate-600 text-xs">{c.divisao_id ? `${c.divisao_id} — ${c.divisao_nome || ''}` : '—'}</td>
                  <td className="px-3 py-2 text-slate-600 text-xs">{c.unidade_nome || c.unidade || '—'}</td>
                  <td className="px-3 py-2 text-slate-600 text-xs">{c.cidade || '—'}</td>
                  <td className="px-3 py-2 text-slate-600 text-xs">{c.country_name || '—'}</td>
                  <td className="px-3 py-2 text-center text-xs text-slate-500">{(c.cost_center_ids || []).length}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button onClick={() => edit(c)} className="p-1 text-slate-400 hover:text-blue-600"><Pencil className="w-4 h-4" /></button>
                    <button onClick={() => del(c.id)} className="p-1 text-slate-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
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
