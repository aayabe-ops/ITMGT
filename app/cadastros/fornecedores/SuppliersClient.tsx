'use client'
import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, Pencil, X, Upload, Download, Search, Wand2 } from 'lucide-react'
import clsx from 'clsx'
import { csvDownload, norm, readTable } from '@/lib/csv'
import GuideCard from '@/components/GuideCard'
import SupplierWizard from './SupplierWizard'

interface Opt { id: string; name: string; code?: string }
interface Supplier {
  id: string; name: string; short_name: string | null; is_active: boolean
  expense_mode: 'RATEIO' | 'DIRETO'; cost_class: 'CAPEX' | 'OPEX' | 'OTC'
  supplier_type_id: string | null; category_id: string | null; unit_id: string | null; project_id: string | null
  type_name: string | null; category_name: string | null; unit_code: string | null; project_name: string | null
  country_ids: string[]; country_codes: string[]; country_names?: string[]
  contract_start: string | null; contract_end: string | null; payment_due_date: string | null
  ga_group_id: string | null; cost_center_id: string | null; ga_group_name: string | null; cost_center_name: string | null
  solution_type_id: string | null
}

const empty = {
  id: '', name: '', short_name: '', supplier_type_id: '', category_id: '',
  expense_mode: 'DIRETO', unit_id: '', cost_class: 'OPEX', project_id: '', country_ids: [] as string[],
  contract_start: '', contract_end: '', payment_due_date: '', ga_group_id: '', cost_center_id: '', solution_type_id: '',
}

export default function SuppliersClient({ types, categories, projects, units, countries, gaGroups, costCenters, solutionTypes, currencies = [] }: {
  types: Opt[]; categories: Opt[]; projects: Opt[]; units: Opt[]; countries: Opt[]; gaGroups: Opt[]; costCenters: Opt[]; solutionTypes: Opt[]; currencies?: Opt[]
}) {
  const [wizard, setWizard] = useState(false)
  const [list, setList] = useState<Supplier[]>([])
  const [q, setQ] = useState('')
  const nq = (s: any) => String(s ?? '').toLowerCase()
  const shown = q.trim() ? list.filter((s: any) => [s.name, s.short_name, s.type_name, s.category_name].some(v => nq(v).includes(nq(q)))) : list
  const [form, setForm] = useState<any>({ ...empty })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [impMsg, setImpMsg] = useState('')
  const editing = !!form.id

  function downloadTemplate() {
    csvDownload('modelo_fornecedores.csv',
      'nome,nome_curto,tipo,categoria,classe,modo,unidade,projeto,paises,vigencia_inicio,vigencia_fim,vencimento',
      [
        'ACME LTDA,ACME,,Software,OPEX,DIRETO,FG-PNG | TI,,BR|UY,2026-01-01,2026-12-31,2026-01-10',
        'Contoso SA,Contoso,,Telecom,CAPEX,RATEIO,,,BR,,,',
      ])
  }
  const toISODate = (v: string) => {
    const s = (v || '').trim(); if (!s) return null
    const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); if (br) return `${br[3]}-${br[2]}-${br[1]}`
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
  }
  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setErr('')
    const { headers, rows: data } = await readTable(file)
    const col = (...k: string[]) => headers.findIndex(h => k.includes(h))
    const iNome = col('nome', 'name'), iShort = col('nomecurto', 'shortname', 'apelido')
    const iTipo = col('tipo', 'type'), iCat = col('categoria', 'category')
    const iClasse = col('classe', 'costclass', 'capexopex'), iModo = col('modo', 'mode', 'rateio')
    const iUn = col('unidade', 'unit'), iProj = col('projeto', 'project'), iPais = col('paises', 'countries', 'pais')
    const iVi = col('vigenciainicio', 'contractstart', 'inicio'), iVf = col('vigenciafim', 'contractend', 'fim'), iVe = col('vencimento', 'vencimentopagamento', 'paymentdue', 'duedate')
    if (iNome < 0) { setErr('CSV inválido: precisa da coluna "nome".'); e.target.value = ''; return }
    const byName = (arr: Opt[], v: string) => { const k = norm(v); return arr.find(o => norm(o.name) === k) }
    const byCode = (arr: Opt[], v: string) => { const k = norm(v); return arr.find(o => norm((o as any).code || '') === k) || byName(arr, v) }
    let ok = 0, fail = 0
    for (const r of data) {
      const g = (i: number) => (i >= 0 ? (r[i] || '').trim() : '')
      const name = g(iNome); if (!name) { fail++; continue }
      const classe = g(iClasse).toUpperCase(); const modo = g(iModo).toUpperCase()
      const body: any = {
        name, short_name: g(iShort) || null,
        supplier_type_id: byName(types, g(iTipo))?.id || null,
        category_id: byName(categories, g(iCat))?.id || null,
        cost_class: ['CAPEX', 'OPEX', 'OTC'].includes(classe) ? classe : 'OPEX',
        expense_mode: modo === 'RATEIO' ? 'RATEIO' : 'DIRETO',
        unit_id: byCode(units, g(iUn))?.id || null,
        project_id: byName(projects, g(iProj))?.id || null,
        country_ids: g(iPais).split('|').map(s => byCode(countries, s.trim())?.id).filter(Boolean),
        contract_start: toISODate(g(iVi)), contract_end: toISODate(g(iVf)), payment_due_date: toISODate(g(iVe)),
      }
      const res = await fetch('/api/suppliers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      res.ok ? ok++ : fail++
    }
    setImpMsg(`Importação: ${ok} fornecedor(es) criado(s)${fail ? `, ${fail} com erro` : ''}.`)
    e.target.value = ''; load()
  }

  const load = useCallback(async () => {
    const r = await fetch('/api/suppliers'); const d = await r.json()
    setList(Array.isArray(d) ? d : [])
  }, [])
  useEffect(() => { load() }, [load])

  const set = (k: string, v: string) => setForm((f: any) => ({ ...f, [k]: v }))
  const reset = () => { setForm({ ...empty, country_ids: [] }); setErr('') }
  const toggleCountry = (id: string) => setForm((f: any) => ({
    ...f, country_ids: f.country_ids.includes(id) ? f.country_ids.filter((x: string) => x !== id) : [...f.country_ids, id],
  }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { setErr('Nome é obrigatório.'); return }
    setSaving(true); setErr('')
    const payload = { ...form }
    if (payload.expense_mode === 'RATEIO') payload.unit_id = ''   // rateio não fixa unidade
    const method = editing ? 'PATCH' : 'POST'
    const r = await fetch('/api/suppliers', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) setErr(d.error || 'Erro ao salvar.')
    else { reset(); load() }
    setSaving(false)
  }

  function edit(s: Supplier) {
    setForm({
      id: s.id, name: s.name, short_name: s.short_name ?? '',
      supplier_type_id: s.supplier_type_id ?? '', category_id: s.category_id ?? '',
      expense_mode: s.expense_mode, unit_id: s.unit_id ?? '', cost_class: s.cost_class, project_id: s.project_id ?? '',
      country_ids: s.country_ids ?? [],
      contract_start: s.contract_start ?? '', contract_end: s.contract_end ?? '', payment_due_date: s.payment_due_date ?? '',
      ga_group_id: s.ga_group_id ?? '', cost_center_id: s.cost_center_id ?? '', solution_type_id: s.solution_type_id ?? '',
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  async function remove(s: Supplier) {
    if (!confirm(`Excluir "${s.name}"?`)) return
    const r = await fetch('/api/suppliers', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: s.id }) })
    const d = await r.json().catch(() => ({}))
    if (d.deactivated) alert('Fornecedor em uso — foi desativado em vez de excluído.')
    load()
  }

  return (
    <div className="page">
      <div className="mb-5 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="page-title">Fornecedores</h1>
          <p className="text-sm text-slate-500">Cadastro com tipo, categoria, rateio/direto, CAPEX·OPEX·OTC e projeto</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setWizard(true)} className="btn-primary text-sm flex items-center gap-1.5">
            <Wand2 className="w-4 h-4" /> Novo fornecedor (guiado)
          </button>
          <button type="button" onClick={downloadTemplate} className="btn-secondary text-sm flex items-center gap-1.5">
            <Download className="w-4 h-4" /> Modelo CSV
          </button>
          <label className="btn-secondary text-sm flex items-center gap-1.5 cursor-pointer">
            <Upload className="w-4 h-4" /> Importar CSV/XLSX
            <input type="file" accept=".csv,.txt,.xlsx,.xls" className="hidden" onChange={handleImport} />
          </label>
        </div>
      </div>

      {wizard && (
        <SupplierWizard types={types} categories={categories} projects={projects} units={units}
          countries={countries} solutionTypes={solutionTypes} currencies={currencies}
          onClose={() => setWizard(false)} onDone={() => { setWizard(false); load() }} />
      )}

      <GuideCard storageKey="/cadastros/fornecedores"
        steps={[
          'Informe o Fornecedor (nome/abreviação), o tipo e a categoria.',
          'Defina se o custo é Rateado ou Direto e a classe (OPEX / CAPEX / OTC).',
          'Para cadastrar em lote, baixe o Modelo CSV e use Importar CSV/XLSX.',
        ]}
        note="O Fornecedor é usado em Contratos, Despesa e nas regras de Rateio." />
      {impMsg && <p className="text-sm text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2 mb-4">{impMsg}</p>}

      {/* Form */}
      <form onSubmit={submit} className="card p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-800">{editing ? 'Editar fornecedor' : 'Novo fornecedor'}</h2>
          {editing && <button type="button" onClick={reset} className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1"><X className="w-3.5 h-3.5" /> cancelar edição</button>}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <label className="label">Nome *</label>
            <input className="input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Razão social / nome" />
          </div>
          <div>
            <label className="label">Nome curto</label>
            <input className="input" value={form.short_name} onChange={e => set('short_name', e.target.value)} placeholder="apelido p/ telas" />
          </div>
          <div>
            <label className="label">Grupo</label>
            <select className="input" value={form.supplier_type_id} onChange={e => set('supplier_type_id', e.target.value)}>
              <option value="">—</option>
              {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Categoria</label>
            <select className="input" value={form.category_id} onChange={e => set('category_id', e.target.value)}>
              <option value="">—</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Classe de custo</label>
            <select className="input" value={form.cost_class} onChange={e => set('cost_class', e.target.value)}>
              <option value="OPEX">OPEX</option>
              <option value="CAPEX">CAPEX</option>
              <option value="OTC">OTC</option>
            </select>
          </div>
          <div>
            <label className="label">Rateio / Direto</label>
            <select className="input" value={form.expense_mode} onChange={e => set('expense_mode', e.target.value)}>
              <option value="DIRETO">Despesa direta na unidade</option>
              <option value="RATEIO">Rateio entre unidades</option>
            </select>
          </div>
          {form.expense_mode === 'DIRETO' && (
            <div>
              <label className="label">Unidade (direto)</label>
              <select className="input" value={form.unit_id} onChange={e => set('unit_id', e.target.value)}>
                <option value="">—</option>
                {units.map(u => <option key={u.id} value={u.id}>{u.code} — {u.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="label">Projeto</label>
            <select className="input" value={form.project_id} onChange={e => set('project_id', e.target.value)}>
              <option value="">—</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">G&A Group</label>
            <select className="input" value={form.ga_group_id} onChange={e => set('ga_group_id', e.target.value)}>
              <option value="">—</option>
              {gaGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Centro de Custo</label>
            <select className="input" value={form.cost_center_id} onChange={e => set('cost_center_id', e.target.value)}>
              <option value="">—</option>
              {costCenters.map(c => <option key={c.id} value={c.id}>{c.code ? `${c.code} — ${c.name}` : c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Área de TI (Solution Type)</label>
            <select className="input" value={form.solution_type_id} onChange={e => set('solution_type_id', e.target.value)}>
              <option value="">—</option>
              {solutionTypes.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Vigência — início</label>
            <input type="date" className="input" value={form.contract_start} onChange={e => set('contract_start', e.target.value)} />
          </div>
          <div>
            <label className="label">Vigência — fim</label>
            <input type="date" className="input" value={form.contract_end} onChange={e => set('contract_end', e.target.value)} />
          </div>
          <div>
            <label className="label">Vencimento do pagamento</label>
            <input type="date" className="input" value={form.payment_due_date} onChange={e => set('payment_due_date', e.target.value)} />
          </div>
        </div>

        <div className="mt-4">
          <label className="label">Países atendidos</label>
          {countries.length === 0 ? (
            <p className="text-xs text-amber-600">Cadastre países primeiro (Cadastros → Países).</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {countries.map(c => {
                const on = form.country_ids.includes(c.id)
                return (
                  <button type="button" key={c.id} onClick={() => toggleCountry(c.id)}
                    className={clsx('px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                      on ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-400')}>
                    {c.code ? `${c.code} — ${c.name}` : c.name}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {err && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mt-4">{err}</p>}
        <div className="flex justify-end mt-4">
          <button className="btn-primary flex items-center gap-1.5" disabled={saving}>
            <Plus className="w-4 h-4" /> {saving ? 'Salvando…' : editing ? 'Salvar alterações' : 'Adicionar fornecedor'}
          </button>
        </div>
      </form>

      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input className="input pl-9" placeholder="Buscar fornecedor…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <span className="text-xs text-slate-400">{shown.length} de {list.length}</span>
      </div>
      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="tbl w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-xs font-medium text-slate-500">
                <th className="text-left px-4 py-2">Fornecedor</th>
                <th className="text-left px-4 py-2">Tipo</th>
                <th className="text-left px-4 py-2">Categoria</th>
                <th className="text-left px-4 py-2">Modo</th>
                <th className="text-left px-4 py-2">Classe</th>
                <th className="text-left px-4 py-2">Projeto</th>
                <th className="text-left px-4 py-2">Vencimento</th>
                <th className="text-left px-4 py-2">Países</th>
                <th className="text-center px-4 py-2">Ativo</th>
                <th className="px-4 py-2 w-20" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {shown.length === 0 && <tr><td colSpan={10} className="px-4 py-8 text-center">{q.trim() ? <span className="text-slate-400">Nada encontrado</span> : <div className="text-slate-500 max-w-md mx-auto"><p className="font-semibold text-slate-700">Você ainda não tem fornecedores</p><p className="text-sm mt-1">Um fornecedor é quem presta o serviço de TI — ex.: SEIDOR (sistemas), Embratel (link de internet). Use o botão <b>Novo fornecedor (guiado)</b> acima.</p></div>}</td></tr>}
              {shown.map(s => (
                <tr key={s.id} className={clsx('hover:bg-slate-50', !s.is_active && 'opacity-50')}>
                  <td className="px-4 py-2.5 text-slate-800">{s.short_name || s.name}</td>
                  <td className="px-4 py-2.5 text-slate-600 text-xs">{s.type_name || '—'}</td>
                  <td className="px-4 py-2.5 text-slate-600 text-xs">{s.category_name || '—'}</td>
                  <td className="px-4 py-2.5">
                    <span className={clsx('px-2 py-0.5 rounded-full text-xs font-medium', s.expense_mode === 'RATEIO' ? 'bg-violet-50 text-violet-700' : 'bg-sky-50 text-sky-700')}>
                      {s.expense_mode === 'RATEIO' ? 'Rateio' : `Direto${s.unit_code ? ' · ' + s.unit_code : ''}`}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs font-mono text-slate-600">{s.cost_class}</td>
                  <td className="px-4 py-2.5 text-slate-600 text-xs">{s.project_name || '—'}</td>
                  <td className="px-4 py-2.5 text-slate-600 text-xs">{s.payment_due_date ? new Date(s.payment_due_date + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}</td>
                  <td className="px-4 py-2.5 text-slate-600 text-xs">{(s.country_names || s.country_codes || []).join(', ') || '—'}</td>
                  <td className="px-4 py-2.5 text-center text-xs">{s.is_active ? '✓' : '—'}</td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <button onClick={() => edit(s)} className="p-1 text-slate-400 hover:text-blue-600"><Pencil className="w-4 h-4" /></button>
                    <button onClick={() => remove(s)} className="p-1 text-slate-400 hover:text-red-500 ml-1"><Trash2 className="w-4 h-4" /></button>
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
