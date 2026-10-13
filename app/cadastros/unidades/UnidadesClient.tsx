'use client'
import { useState, useEffect, useCallback } from 'react'
import { Pencil, Trash2, Plus, Warehouse, X, Upload, Download, Search } from 'lucide-react'
import GuideCard from '@/components/GuideCard'
import { csvDownload, readTable } from '@/lib/csv'

interface Opt { id: string; code: string; name: string }
const empty = { id: '', code: '', name: '', country_id: '', cost_center_ids: [] as string[] }

export default function UnidadesClient({ countries, costCenters }: { countries: Opt[]; costCenters: Opt[] }) {
  const [list, setList] = useState<any[]>([])
  const [q, setQ] = useState('')
  const nq = (s: any) => String(s ?? '').toLowerCase()
  const shown = q.trim() ? list.filter((u: any) => [u.code, u.name, u.country_name, u.pais].some(v => nq(v).includes(nq(q)))) : list
  const [form, setForm] = useState<any>({ ...empty })
  const [err, setErr] = useState(''); const [msg, setMsg] = useState(''); const [saving, setSaving] = useState(false)
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))
  const toggleCC = (id: string) => setForm((f: any) => ({ ...f, cost_center_ids: f.cost_center_ids.includes(id) ? f.cost_center_ids.filter((x: string) => x !== id) : [...f.cost_center_ids, id] }))
  const ccById = (id: string) => costCenters.find(c => c.id === id)

  const load = useCallback(async () => { const r = await fetch('/api/unidades'); const d = await r.json(); setList(Array.isArray(d) ? d : []) }, [])
  useEffect(() => { load() }, [load])

  function edit(u: any) {
    setForm({ id: u.id, code: u.code, name: u.name, country_id: u.country_id ?? '', cost_center_ids: u.cost_center_ids ?? [] })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const reset = () => { setForm({ ...empty, cost_center_ids: [] }); setErr('') }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!form.code || !form.name) { setErr('Unidade (ID) e Descrição são obrigatórios.'); return }
    setSaving(true); setErr('')
    const res = await fetch('/api/unidades', { method: form.id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    const d = await res.json().catch(() => ({})); setSaving(false)
    if (res.ok) { reset(); load(); setMsg('Salvo.') } else setErr(d.error || 'Erro ao salvar.')
  }
  async function del(id: string) {
    if (!confirm('Excluir unidade? Os centros de custo dela ficam sem unidade (não são apagados).')) return
    await fetch('/api/unidades', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }); load()
  }
  function downloadTemplate() {
    csvDownload('modelo_unidades.csv', 'codigo,nome,pais', ['SP01,Osasco,BR', 'RJ01,Rio de Janeiro,BR'])
  }
  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setErr(''); setMsg('')
    const { headers, rows } = await readTable(file)
    const has = (h: string, keys: string[]) => keys.some(k => h.includes(k))
    const iC = headers.findIndex(h => has(h, ['codigo', 'code', 'cod', 'unidade', 'sigla', 'id']))
    let iN = headers.findIndex((h, idx) => idx !== iC && has(h, ['nome', 'name', 'descri']))
    const iP = headers.findIndex(h => has(h, ['pais', 'country']))
    if (iC < 0 || iN < 0) {
      setErr(`CSV inválido: não encontrei as colunas de código e nome. Cabeçalhos lidos: [${headers.join(', ') || 'vazio'}]. Aceito: codigo/unidade/id e nome/descricao. Dica: baixe o "Modelo CSV".`)
      e.target.value = ''; return
    }
    const payload = rows.map(r => ({ code: (r[iC] || '').trim(), name: (r[iN] || '').trim(), pais: iP >= 0 ? (r[iP] || '').trim() : '' })).filter(r => r.code && r.name)
    if (!payload.length) { setErr('Nenhuma linha válida no arquivo.'); e.target.value = ''; return }
    const res = await fetch('/api/unidades', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows: payload }) })
    const d = await res.json().catch(() => ({}))
    setMsg(res.ok ? `Importação: ${d.saved ?? payload.length} unidade(s) salva(s)${d.errors ? `, ${d.errors} com erro/duplicado` : ''}.` : (d.error || 'Erro na importação.'))
    e.target.value = ''; load()
  }

  return (
    <div className="page space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title flex items-center gap-2"><Warehouse className="w-5 h-5 text-blue-600" /> Unidades</h1>
          <p className="text-sm text-slate-500">Agrupe os Centros de Custo por Unidade — uma Unidade contém vários Centros de Custo.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={downloadTemplate} className="btn-secondary text-sm flex items-center gap-1.5"><Download className="w-4 h-4" /> Modelo CSV</button>
          <label className="btn-secondary text-sm flex items-center gap-1.5 cursor-pointer"><Upload className="w-4 h-4" /> Importar CSV/XLSX
            <input type="file" accept=".csv,.txt,.xlsx,.xls" className="hidden" onChange={handleImport} /></label>
        </div>
      </div>

      <GuideCard storageKey="/cadastros/unidades"
        steps={[
          'Informe Código e Nome da Unidade (ex.: SP01 — Osasco).',
          'Na tela Centro de Custo, vincule os CCs a esta Unidade.',
          'A Unidade é a dimensão de negócio usada na Despesa e no Rateio.',
        ]}
        note="Uma Unidade agrupa vários Centros de Custo. Cadastre a Unidade antes de vincular os CCs." />

      {msg && <div className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-4 py-3 rounded-lg text-sm font-medium">{msg}</div>}
      {err && <div className="bg-red-50 text-red-700 border border-red-200 px-4 py-3 rounded-lg text-sm font-medium">{err}</div>}

      <form onSubmit={save} className="card p-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div><label className="label">Unidade (ID) *</label><input className="input font-mono" value={form.code} onChange={e => set('code', e.target.value)} /></div>
          <div><label className="label">Descrição *</label><input className="input" value={form.name} onChange={e => set('name', e.target.value)} /></div>
          <div><label className="label">País</label>
            <select className="input" value={form.country_id} onChange={e => set('country_id', e.target.value)}>
              <option value="">—</option>{countries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>

        <div className="mt-4 md:max-w-lg">
          <label className="label">Centros de Custo desta Unidade <span className="text-slate-400 font-normal">({form.cost_center_ids.length})</span></label>
          <select className="input" value="" onChange={e => { if (e.target.value) toggleCC(e.target.value); e.currentTarget.value = '' }}>
            <option value="">Selecione para vincular…</option>
            {costCenters.filter(cc => !form.cost_center_ids.includes(cc.id)).map(cc => <option key={cc.id} value={cc.id}>{cc.code} — {cc.name}</option>)}
          </select>
          {form.cost_center_ids.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {form.cost_center_ids.map((id: string) => {
                const cc = ccById(id)
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
          <h2 className="text-sm font-semibold text-slate-800">Unidades ({shown.length}{shown.length !== list.length ? ` de ${list.length}` : ''})</h2>
          <div className="relative w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input className="input h-8 text-sm pl-9" placeholder="Buscar unidade…" value={q} onChange={e => setQ(e.target.value)} />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="tbl w-full text-sm">
            <thead><tr className="text-xs text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-100">
              <th className="text-left px-3 py-2.5 font-medium">Unidade (ID)</th><th className="text-left px-3 py-2.5 font-medium">Descrição</th>
              <th className="text-left px-3 py-2.5 font-medium">País</th><th className="text-left px-3 py-2.5 font-medium">Centros de Custo</th><th className="px-3 py-2.5" />
            </tr></thead>
            <tbody className="divide-y divide-slate-50">
              {shown.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center">{q.trim() ? <span className="text-slate-400">Nada encontrado</span> : <div className="text-slate-500 max-w-md mx-auto"><p className="font-semibold text-slate-700">Você ainda não tem unidades</p><p className="text-sm mt-1">Uma unidade é uma filial/planta vinculada a um país. Ex.: Guarulhos, Londrina. Ela agrupa os centros de custo.</p><p className="text-xs text-slate-400 mt-2">Cadastre a primeira no formulário acima.</p></div>}</td></tr>}
              {shown.map(u => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2 font-mono text-xs text-slate-600">{u.code}</td>
                  <td className="px-3 py-2 text-slate-700">{u.name}</td>
                  <td className="px-3 py-2 text-slate-600 text-xs">{u.country_name || '—'}</td>
                  <td className="px-3 py-2 text-slate-600 text-xs">
                    {(u.cost_center_ids || []).length === 0 ? <span className="text-slate-400">—</span> : (
                      <div className="flex flex-wrap gap-1">
                        {(u.cost_center_ids as string[]).slice(0, 10).map(id => <span key={id} className="font-mono bg-slate-100 rounded px-1.5 py-0.5 text-[11px]">{ccById(id)?.code ?? '?'}</span>)}
                        {(u.cost_center_ids as string[]).length > 10 && <span className="text-slate-400 text-[11px] self-center">+{(u.cost_center_ids as string[]).length - 10}</span>}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button onClick={() => edit(u)} className="p-1 text-slate-400 hover:text-blue-600"><Pencil className="w-4 h-4" /></button>
                    <button onClick={() => del(u.id)} className="p-1 text-slate-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
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
