'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { Pencil, Trash2, Plus, Upload, Download, Wallet, X, Sparkles, CheckCircle2, Search } from 'lucide-react'
import clsx from 'clsx'
import { readMatrix } from '@/lib/csv'
import GuideCard from '@/components/GuideCard'

interface Opt { id: string; code: string; name: string }
const empty = { id: '', code: '', name: '', descr_en: '', centro_logistico_id: '', centro_logistico_nome: '', company_id: '', divisao_id: '', divisao_nome: '', country_id: '', unidade_id: '', cost_nature: 'COGS' }
const NATUREZAS = [['COGS', 'COGS — operação do site'], ['G&A', 'G&A — back-office'], ['HOLDING', 'Holding — projetos'], ['TRANSPORTE', 'Transporte']]

// normaliza cabeçalho (remove acentos, espaços, _ e pontuação como parênteses)
const stripAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
const normH = (s: string) => stripAccents(String(s || '')).toLowerCase().replace(/[\s_().-]+/g, '')

export default function CostCenterClient({ companies, countries, unidades }: { companies: Opt[]; countries: Opt[]; unidades: Opt[] }) {
  const [list, setList] = useState<any[]>([])
  const [q, setQ] = useState('')
  const nq = (s: any) => String(s ?? '').toLowerCase()
  const shown = q.trim() ? list.filter((c: any) => [c.code, c.name, c.descr_en, c.unidade_nome, c.centro_logistico_nome, c.company_name].some(v => nq(v).includes(nq(q)))) : list
  const [form, setForm] = useState<any>({ ...empty })
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))
  const compName = (id: string) => companies.find(c => c.id === id)?.name ?? '—'
  const compCode = (id: string) => companies.find(c => c.id === id)?.code ?? ''

  const load = useCallback(async () => { const r = await fetch('/api/units'); const d = await r.json(); setList(Array.isArray(d) ? d : []) }, [])
  useEffect(() => { load() }, [load])

  function edit(c: any) {
    setForm({ ...empty, id: c.id, code: c.code, name: c.name, descr_en: c.descr_en ?? '', centro_logistico_id: c.centro_logistico_id ?? '', centro_logistico_nome: c.centro_logistico_nome ?? '', company_id: c.company_id ?? '', divisao_id: c.divisao_id ?? '', divisao_nome: c.divisao_nome ?? '', country_id: c.country_id ?? '', unidade_id: c.unidade_id ?? '', cost_nature: c.cost_nature ?? 'COGS' })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const reset = () => { setForm({ ...empty }); setErr('') }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!form.code || !form.name) { setErr('Centro de Custo (ID) e Descrição são obrigatórios.'); return }
    if (!form.unidade_id) { setErr('Vincule o Centro de Custo a uma Unidade — é obrigatório (evita CC órfão).'); return }
    setSaving(true); setErr('')
    const res = await fetch('/api/units', { method: form.id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    const d = await res.json().catch(() => ({})); setSaving(false)
    if (res.ok) { reset(); load(); setMsg('Salvo.') } else setErr(d.error || 'Erro ao salvar.')
  }
  async function del(id: string) {
    if (!confirm('Excluir centro de custo?')) return
    await fetch('/api/units', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }); load()
  }

  function downloadTemplate() {
    const header = 'CENTRO DE CUSTO (ID),CENTRO DE CUSTO (Descrição-EN),CENTRO DE CUSTO (Descrição),CENTRO LOGISTICO (ID),CENTRO LOGISTICO (unidade),EMPRESA (ID),EMPRESA (Descrição PT),DIVISÃO (ID),DIVISÃO (Descrição),País,UNIDADE (código)'
    const ex = 'CG-PNG | TI'
    const body = [`3130060822,IT Infrastructure InDir,"${ex}",3130,Paranaguá AZ-CG,O311,Martini Meat (Armazem),CG,AZ - Carga Geral,Brasil,PARANAGUA`].join('\r\n')
    const blob = new Blob(['﻿' + header + '\r\n' + body], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'modelo_centro_custo.csv'; a.click(); URL.revokeObjectURL(a.href)
  }

  async function handleCSV(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setMsg(''); setErr('')
    const matrix = await readMatrix(file)
    if (!matrix.length) { setErr('Arquivo vazio ou ilegível.'); e.target.value = ''; return }
    const H = matrix[0].map(normH)
    const idx = (...k: string[]) => H.findIndex(h => k.some(x => h.includes(x)))
    const iCod = idx('centrodecustoid', 'ccid'), iEn = idx('descricaoen', 'descen'), iPt = idx('centrodecustodescricao', 'centrodecusto')
    const iClId = idx('centrologisticoid', 'centrologistico'), iClN = idx('centrologisticounidade')
    const iEmpId = idx('empresaid'), iEmpN = idx('empresadescricao', 'empresa')
    const iDivId = idx('divisaoid'), iDivN = idx('divisaodescricao', 'divisao'), iPais = idx('pais')
    const iUni = idx('unidadecodigo', 'unidadeid', 'unidadedocc')
    // ajustes: "centrodecusto" pode casar ID e PT; força ID na 1a coluna
    const rows = matrix.slice(1).map(f => ({
      code: (f[iCod] || f[0] || '').trim(), descr_en: (f[iEn] || '').trim(), name: (f[iPt] || f[2] || '').trim(),
      centro_logistico_id: (f[iClId] || '').trim(), centro_logistico_nome: (f[iClN] || '').trim(),
      empresa_code: (f[iEmpId] || '').trim(), empresa_nome: (f[iEmpN] || '').trim(),
      divisao_id: (f[iDivId] || '').trim(), divisao_nome: (f[iDivN] || '').trim(),
      pais: (f[iPais] || '').trim(), unidade: (f[iUni] || '').trim(),
    })).filter(r => r.code && r.name)
    if (!rows.length) { setErr('Nenhuma linha válida no CSV.'); e.target.value = ''; return }
    const semUnidade = rows.filter(r => !r.unidade).length
    const res = await fetch('/api/units', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows }) })
    const dd = await res.json().catch(() => ({}))
    if (res.ok) {
      const hint = semUnidade > 0 ? ` — ${semUnidade} sem Unidade: use “Higienizar órfãos” para vincular.` : ''
      setMsg(`Importado: ${dd.saved ?? rows.length} centro(s) de custo${dd.errors ? `, ${dd.errors} com erro` : ''}.${hint}`); load()
    } else setErr(dd.error || 'Erro ao importar.')
    e.target.value = ''
  }

  // ── Higienização de órfãos (CC sem Unidade) ──
  const [hygOpen, setHygOpen] = useState(false)
  const [hygOrphans, setHygOrphans] = useState<any[]>([])
  const [hygUnidades, setHygUnidades] = useState<Opt[]>([])
  const [hygSel, setHygSel] = useState<Record<string, string>>({})
  const [hygBusy, setHygBusy] = useState(false)
  async function openHygiene() {
    setMsg(''); setErr(''); setHygBusy(true)
    try {
      const r = await fetch('/api/units/hygiene'); const d = await r.json()
      if (!r.ok) { setErr(d.error || 'Erro ao carregar órfãos.'); setHygBusy(false); return }
      setHygOrphans(d.orphans || []); setHygUnidades(d.unidades || [])
      const sel: Record<string, string> = {}
      for (const o of d.orphans || []) sel[o.id] = o.suggested_unidade_id || ''
      setHygSel(sel); setHygOpen(true)
    } catch { setErr('Erro ao carregar órfãos.') }
    setHygBusy(false)
  }
  async function applyHygiene() {
    const links = Object.entries(hygSel).filter(([, v]) => v).map(([id, unidade_id]) => ({ id, unidade_id }))
    if (!links.length) { setErr('Selecione ao menos uma Unidade.'); return }
    setHygBusy(true)
    const r = await fetch('/api/units/hygiene', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ links }) })
    const d = await r.json().catch(() => ({}))
    setHygBusy(false)
    if (r.ok) { setHygOpen(false); setMsg(`Higienizado: ${d.updated} Centro(s) de Custo vinculado(s) à Unidade${d.errors ? `, ${d.errors} com erro` : ''}.`); load() }
    else setErr(d.error || 'Erro ao vincular.')
  }

  return (
    <div className="page space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title flex items-center gap-2"><Wallet className="w-5 h-5 text-blue-600" /> Centro de Custo</h1>
          <p className="text-sm text-slate-500">Cadastro único (Unidade = Centro de Custo): ID, descrições, Centro Logístico, Empresa e Divisão.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={openHygiene} disabled={hygBusy} className="btn-secondary text-sm flex items-center gap-1.5"><Sparkles className="w-4 h-4 text-amber-500" /> Higienizar órfãos</button>
          <button onClick={downloadTemplate} className="btn-secondary text-sm flex items-center gap-1.5"><Download className="w-4 h-4" /> Baixar modelo</button>
          <label className="btn-primary text-sm flex items-center gap-1.5 cursor-pointer"><Upload className="w-4 h-4" /> Importar CSV/XLSX
            <input ref={fileRef} type="file" accept=".csv,.txt,.xlsx,.xls" className="hidden" onChange={handleCSV} /></label>
        </div>
      </div>

      {hygOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto" onClick={() => setHygOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl my-8" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="font-semibold text-slate-800 flex items-center gap-2"><Sparkles className="w-4 h-4 text-amber-500" /> Higienizar Centros de Custo órfãos</h2>
              <button onClick={() => setHygOpen(false)} className="p-1 rounded hover:bg-slate-100"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-5 py-3 text-xs text-slate-500">
              {hygOrphans.length} CC sem Unidade. A sugestão vem do <b>centro logístico</b>; confira os que ficaram em branco e selecione a Unidade. CCs com <b>budget</b> são marcados.
            </div>
            <div className="max-h-[55vh] overflow-y-auto px-5 pb-2">
              <table className="tbl w-full text-sm">
                <thead className="text-xs text-slate-400 text-left sticky top-0 bg-white">
                  <tr><th className="py-1.5 pr-2">Centro de Custo</th><th className="py-1.5 pr-2">Centro logístico</th><th className="py-1.5">Unidade</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {hygOrphans.map(o => (
                    <tr key={o.id}>
                      <td className="py-1.5 pr-2">
                        <span className="font-mono text-[11px]">{o.code}</span>
                        {Number(o.budget_lines) > 0 && <span className="ml-1.5 text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full">budget</span>}
                      </td>
                      <td className="py-1.5 pr-2 text-slate-500 text-xs">{o.cl || '—'}</td>
                      <td className="py-1.5">
                        <select className={`input text-sm py-1 ${hygSel[o.id] ? '' : 'border-amber-300'}`}
                          value={hygSel[o.id] || ''} onChange={e => setHygSel(s => ({ ...s, [o.id]: e.target.value }))}>
                          <option value="">— escolher —</option>
                          {hygUnidades.map(u => <option key={u.id} value={u.id}>{u.code} — {u.name}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between gap-2 px-5 py-4 border-t border-slate-100">
              <span className="text-xs text-slate-500">{Object.values(hygSel).filter(Boolean).length} de {hygOrphans.length} com Unidade</span>
              <div className="flex gap-2">
                <button onClick={() => setHygOpen(false)} className="btn-secondary text-sm">Cancelar</button>
                <button onClick={applyHygiene} disabled={hygBusy} className="btn-primary text-sm flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" /> {hygBusy ? 'Vinculando…' : 'Vincular selecionados'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <GuideCard storageKey="/cadastros/centro-custo"
        steps={[
          'Informe o ID/Código e as descrições do Centro de Custo.',
          'Vincule o CC a uma Unidade — é isso que faz o CC aparecer filtrado na tela de Despesa.',
          'Para carga inicial, baixe o modelo e use Importar CSV/XLSX.',
        ]}
        note="Cadastre a Unidade antes, para poder associar os Centros de Custo a ela." />

      {msg && <div className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-4 py-3 rounded-lg text-sm font-medium">{msg}</div>}
      {err && <div className="bg-red-50 text-red-700 border border-red-200 px-4 py-3 rounded-lg text-sm font-medium">{err}</div>}

      <form onSubmit={save} className="card p-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div><label className="label">Centro de Custo (ID) *</label><input className="input font-mono" value={form.code} onChange={e => set('code', e.target.value)} /></div>
          <div><label className="label">Descrição (PT) *</label><input className="input" placeholder="CG-PNG | TI" value={form.name} onChange={e => set('name', e.target.value)} /></div>
          <div><label className="label">Descrição (EN)</label><input className="input" value={form.descr_en} onChange={e => set('descr_en', e.target.value)} /></div>
          <div><label className="label">Centro Logístico (ID)</label><input className="input font-mono" value={form.centro_logistico_id} onChange={e => set('centro_logistico_id', e.target.value)} /></div>
          <div><label className="label">Centro Logístico (unidade)</label><input className="input" value={form.centro_logistico_nome} onChange={e => set('centro_logistico_nome', e.target.value)} /></div>
          <div><label className="label">Empresa</label>
            <select className="input" value={form.company_id} onChange={e => set('company_id', e.target.value)}>
              <option value="">—</option>{companies.map(c => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
            </select>
          </div>
          <div><label className="label">Unidade *</label>
            <select className="input" value={form.unidade_id} onChange={e => set('unidade_id', e.target.value)}>
              <option value="">—</option>{unidades.map(u => <option key={u.id} value={u.id}>{u.code} — {u.name}</option>)}
            </select>
          </div>
          <div><label className="label">Natureza do custo</label>
            <select className="input" value={form.cost_nature} onChange={e => set('cost_nature', e.target.value)}>
              {NATUREZAS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div><label className="label">Divisão (ID)</label><input className="input font-mono" value={form.divisao_id} onChange={e => set('divisao_id', e.target.value)} /></div>
          <div><label className="label">Divisão (Descrição)</label><input className="input" value={form.divisao_nome} onChange={e => set('divisao_nome', e.target.value)} /></div>
          <div><label className="label">País</label>
            <select className="input" value={form.country_id} onChange={e => set('country_id', e.target.value)}>
              <option value="">—</option>{countries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>
        
        <div className="flex items-center gap-2 mt-4">
          <button type="submit" className="btn-primary flex items-center gap-1.5" disabled={saving}>{form.id ? <><Pencil className="w-4 h-4" /> Atualizar</> : <><Plus className="w-4 h-4" /> Adicionar</>}</button>
          {form.id && <button type="button" className="btn-secondary" onClick={reset}><X className="w-4 h-4" /> Cancelar</button>}
        </div>
      </form>

      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-sm font-semibold text-slate-800">Centros de Custo ({shown.length}{shown.length !== list.length ? ` de ${list.length}` : ''})</h2>
          <div className="relative w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input className="input h-8 text-sm pl-9" placeholder="Buscar centro de custo…" value={q} onChange={e => setQ(e.target.value)} />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="tbl w-full text-sm">
            <thead><tr className="text-xs text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-100">
              <th className="text-left px-3 py-2.5 font-medium">CC (ID)</th><th className="text-left px-3 py-2.5 font-medium">Descrição PT</th>
              <th className="text-left px-3 py-2.5 font-medium">Descrição EN</th><th className="text-left px-3 py-2.5 font-medium">Centro Logístico</th>
              <th className="text-left px-3 py-2.5 font-medium">Empresa</th><th className="text-left px-3 py-2.5 font-medium">Unidade</th><th className="text-left px-3 py-2.5 font-medium">Natureza</th><th className="text-left px-3 py-2.5 font-medium">Divisão</th><th className="text-left px-3 py-2.5 font-medium">País</th><th className="px-3 py-2.5" />
            </tr></thead>
            <tbody className="divide-y divide-slate-50">
              {shown.length === 0 && <tr><td colSpan={10} className="px-4 py-8 text-center">{q.trim() ? <span className="text-slate-400">Nada encontrado</span> : <div className="text-slate-500 max-w-md mx-auto"><p className="font-semibold text-slate-700">Você ainda não tem centros de custo</p><p className="text-sm mt-1">O centro de custo (CC) é onde o budget e o realizado batem. Pertence a um país + unidade + empresa. Cadastre país, empresa e unidade antes.</p><p className="text-xs text-slate-400 mt-2">Cadastre o primeiro no formulário acima.</p></div>}</td></tr>}
              {shown.map(c => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2 font-mono text-xs text-slate-600">{c.code}</td>
                  <td className="px-3 py-2 text-slate-700">{c.name}</td>
                  <td className="px-3 py-2 text-slate-500 text-xs">{c.descr_en || '—'}</td>
                  <td className="px-3 py-2 text-slate-600 text-xs">{c.centro_logistico_id ? `${c.centro_logistico_id} — ${c.centro_logistico_nome || ''}` : '—'}</td>
                  <td className="px-3 py-2 text-slate-600 text-xs">{c.company_code ? `${c.company_code} — ${c.company_name}` : compName(c.company_id)}</td>
                  <td className="px-3 py-2 text-slate-600 text-xs">{c.unidade_code ? `${c.unidade_code} — ${c.unidade_nome}` : (c.unidade_nome || '—')}</td>
                  <td className="px-3 py-2 text-xs"><span className={clsx('px-2 py-0.5 rounded-full font-medium', (c.cost_nature || 'COGS') === 'COGS' ? 'bg-sky-50 text-sky-700' : (c.cost_nature === 'G&A' ? 'bg-violet-50 text-violet-700' : c.cost_nature === 'TRANSPORTE' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'))}>{c.cost_nature || 'COGS'}</span></td>
                  <td className="px-3 py-2 text-slate-600 text-xs">{c.divisao_id ? `${c.divisao_id} — ${c.divisao_nome || ''}` : '—'}</td>
                  <td className="px-3 py-2 text-slate-600 text-xs">{c.country_name || '—'}</td>
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
