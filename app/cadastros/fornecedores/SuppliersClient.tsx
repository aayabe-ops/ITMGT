'use client'
import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, Pencil, X, Upload, Download, Search, Wand2, FileSignature } from 'lucide-react'
import clsx from 'clsx'
import { csvDownload, norm, readTable } from '@/lib/csv'
import GuideCard from '@/components/GuideCard'
import SupplierWizard from './SupplierWizard'

interface Opt { id: string; name: string; code?: string; platform_name?: string | null }
interface Supplier {
  id: string; name: string; short_name: string | null; cnpj: string | null; is_active: boolean
  supplier_type_id: string | null; type_name: string | null
  country_ids: string[]; country_codes: string[]; country_names?: string[]
  platform_ids: string[]; platform_names?: string[]
}

const empty = {
  id: '', name: '', short_name: '', cnpj: '', supplier_type_id: '', country_ids: [] as string[], platform_ids: [] as string[],
}

export default function SuppliersClient({ types, categories, projects, units, countries, platforms = [], solutionTypes, currencies = [] }: {
  types: Opt[]; categories: Opt[]; projects: Opt[]; units: Opt[]; countries: Opt[]; platforms?: Opt[]; gaGroups?: Opt[]; costCenters?: Opt[]; solutionTypes: Opt[]; currencies?: Opt[]
}) {
  const [wizard, setWizard] = useState(false)
  const [list, setList] = useState<Supplier[]>([])
  const [q, setQ] = useState('')
  const nq = (s: any) => String(s ?? '').toLowerCase()
  const shown = q.trim() ? list.filter((s: any) => [s.name, s.short_name, s.cnpj, s.type_name].some(v => nq(v).includes(nq(q)))) : list
  const [form, setForm] = useState<any>({ ...empty })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [impMsg, setImpMsg] = useState('')
  const editing = !!form.id

  function downloadTemplate() {
    csvDownload('modelo_fornecedores.csv',
      'nome,nome_curto,cnpj,tipo,plataformas,paises',
      [
        'ACME LTDA,ACME,12.345.678/0001-90,Software,Andina|Cono Sur,BR|UY',
        'Contoso SA,Contoso,,Telecom,Andina,BR',
      ])
  }
  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setErr('')
    const { headers, rows: data } = await readTable(file)
    const col = (...k: string[]) => headers.findIndex(h => k.includes(h))
    const iNome = col('nome', 'name'), iShort = col('nomecurto', 'shortname', 'apelido')
    const iCnpj = col('cnpj', 'documento', 'taxid')
    const iTipo = col('tipo', 'type', 'grupo'), iPais = col('paises', 'countries', 'pais')
    const iPlat = col('plataformas', 'platforms', 'plataforma')
    if (iNome < 0) { setErr('CSV inválido: precisa da coluna "nome".'); e.target.value = ''; return }
    const byName = (arr: Opt[], v: string) => { const k = norm(v); return arr.find(o => norm(o.name) === k) }
    const byCode = (arr: Opt[], v: string) => { const k = norm(v); return arr.find(o => norm((o as any).code || '') === k) || byName(arr, v) }
    let ok = 0, fail = 0
    for (const r of data) {
      const g = (i: number) => (i >= 0 ? (r[i] || '').trim() : '')
      const name = g(iNome); if (!name) { fail++; continue }
      const body: any = {
        name, short_name: g(iShort) || null, cnpj: g(iCnpj) || null,
        supplier_type_id: byName(types, g(iTipo))?.id || null,
        country_ids: g(iPais).split('|').map(s => byCode(countries, s.trim())?.id).filter(Boolean),
        platform_ids: g(iPlat).split('|').map(s => byName(platforms, s.trim())?.id).filter(Boolean),
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
  const reset = () => { setForm({ ...empty, country_ids: [], platform_ids: [] }); setErr('') }
  const toggleCountry = (id: string) => setForm((f: any) => ({
    ...f, country_ids: f.country_ids.includes(id) ? f.country_ids.filter((x: string) => x !== id) : [...f.country_ids, id],
  }))
  const togglePlatform = (id: string) => setForm((f: any) => ({
    ...f, platform_ids: f.platform_ids.includes(id) ? f.platform_ids.filter((x: string) => x !== id) : [...f.platform_ids, id],
  }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { setErr('Nome é obrigatório.'); return }
    setSaving(true); setErr('')
    const payload = { ...form }
    const method = editing ? 'PATCH' : 'POST'
    const r = await fetch('/api/suppliers', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) setErr(d.error || 'Erro ao salvar.')
    else { reset(); load() }
    setSaving(false)
  }

  function edit(s: Supplier) {
    setForm({
      id: s.id, name: s.name, short_name: s.short_name ?? '', cnpj: s.cnpj ?? '',
      supplier_type_id: s.supplier_type_id ?? '', country_ids: s.country_ids ?? [], platform_ids: s.platform_ids ?? [],
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
          <p className="text-sm text-slate-500">Quem é o fornecedor (identidade). O que ele presta — categoria, modo, valor e rateio — fica em cada <b>Serviço</b> (ícone <FileSignature className="w-3.5 h-3.5 inline -mt-0.5" /> na lista).</p>
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
          countries={countries} platforms={platforms} solutionTypes={solutionTypes} currencies={currencies}
          onClose={() => setWizard(false)} onDone={() => { setWizard(false); load() }} />
      )}

      <GuideCard storageKey="/cadastros/fornecedores"
        steps={[
          'Identidade: informe nome/abreviação, CNPJ, grupo e as plataformas e países atendidos.',
          'Depois de salvar, use o ícone de Serviços na lista para cadastrar o que o fornecedor presta (categoria, modo, valor e rateio em cada serviço).',
          'Os campos de categoria/modo/classe abaixo são padrões opcionais, herdados por novos serviços — podem ser ajustados por serviço.',
        ]}
        note="Fluxo: Fornecedor (identidade) → Serviços → Rateio por serviço." />
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
            <label className="label">CNPJ / documento</label>
            <input className="input" value={form.cnpj} onChange={e => set('cnpj', e.target.value)} placeholder="00.000.000/0000-00" />
          </div>
          <div>
            <label className="label">Grupo</label>
            <select className="input" value={form.supplier_type_id} onChange={e => set('supplier_type_id', e.target.value)}>
              <option value="">—</option>
              {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
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

        <div className="mt-4">
          <label className="label">Plataformas atendidas</label>
          {platforms.length === 0 ? (
            <p className="text-xs text-amber-600">Cadastre plataformas primeiro (Cadastros → Plataformas).</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {platforms.map(p => {
                const on = form.platform_ids.includes(p.id)
                return (
                  <button type="button" key={p.id} onClick={() => togglePlatform(p.id)}
                    className={clsx('px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                      on ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-slate-600 border-slate-200 hover:border-violet-400')}>
                    {p.name}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <p className="text-xs text-slate-400 mt-4 border-t border-slate-100 pt-3">Categoria, modo (direto/rateio), unidade, classe e vencimento ficam em cada <b>Serviço</b> deste fornecedor — use o ícone de Serviços na lista abaixo.</p>

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
                <th className="text-left px-4 py-2">CNPJ</th>
                <th className="text-left px-4 py-2">Grupo</th>
                <th className="text-left px-4 py-2">Países</th>
                <th className="text-left px-4 py-2">Plataforma</th>
                <th className="text-center px-4 py-2">Ativo</th>
                <th className="px-4 py-2 w-20" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {shown.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center">{q.trim() ? <span className="text-slate-400">Nada encontrado</span> : <div className="text-slate-500 max-w-md mx-auto"><p className="font-semibold text-slate-700">Você ainda não tem fornecedores</p><p className="text-sm mt-1">Um fornecedor é quem presta o serviço de TI — ex.: SEIDOR (sistemas), Embratel (link de internet). Use o botão <b>Novo fornecedor (guiado)</b> acima.</p></div>}</td></tr>}
              {shown.map(s => (
                <tr key={s.id} className={clsx('hover:bg-slate-50', !s.is_active && 'opacity-50')}>
                  <td className="px-4 py-2.5 text-slate-800">{s.short_name || s.name}</td>
                  <td className="px-4 py-2.5 text-slate-500 text-xs font-mono">{s.cnpj || '—'}</td>
                  <td className="px-4 py-2.5 text-slate-600 text-xs">{s.type_name || '—'}</td>
                  <td className="px-4 py-2.5 text-slate-600 text-xs">{(s.country_names || s.country_codes || []).join(', ') || '—'}</td>
                  <td className="px-4 py-2.5 text-slate-500 text-xs">{(s.platform_names || []).join(', ') || '—'}</td>
                  <td className="px-4 py-2.5 text-center text-xs">{s.is_active ? '✓' : '—'}</td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <a href={`/cadastros/contratos?fornecedor=${s.id}`} title="Serviços deste fornecedor" className="p-1 text-slate-400 hover:text-emerald-600 inline-flex"><FileSignature className="w-4 h-4" /></a>
                    <button onClick={() => edit(s)} className="p-1 text-slate-400 hover:text-blue-600 ml-1"><Pencil className="w-4 h-4" /></button>
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
