'use client'
import { useCallback, useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, X, Search } from 'lucide-react'
import { MONTHS_PT } from '@/lib/types'
import { yearOptions, DEFAULT_YEAR } from '@/lib/years'
import GuideCard from '@/components/GuideCard'
import clsx from 'clsx'

interface Opt { id: string; code?: string; name: string; unidade_id?: string | null }
interface Props { suppliers: Opt[]; unidades: Opt[]; units: Opt[] }

const COST_CLASSES = [
  { value: 'OPEX', label: 'OPEX' },
  { value: 'CAPEX', label: 'CAPEX' },
  { value: 'OPEX-OTC', label: 'OPEX OTC' },
]
const BRL = (n: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n || 0)
const empty = {
  id: '', supplier_id: '', unidade_id: '', unit_id: '', cost_class: '',
  value: '', year: DEFAULT_YEAR, month: new Date().getMonth() + 1, notes: '',
}

export default function DespesaClient({ suppliers, unidades, units }: Props) {
  const [list, setList] = useState<any[]>([])
  const [q, setQ] = useState('')
  const nq = (s: any) => String(s ?? '').toLowerCase()
  const shown = q.trim() ? list.filter((d: any) => [d.code, d.supplier_name, d.unidade_code, d.unidade_name, d.unit_code, d.unit_name, d.cost_class].some(v => nq(v).includes(nq(q)))) : list
  const [form, setForm] = useState<any>({ ...empty })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  // Fornecedores em estado local (permite cadastro rápido embutido)
  const [sups, setSups] = useState<Opt[]>(suppliers)
  const [nsOpen, setNsOpen] = useState(false)
  const [ns, setNs] = useState({ name: '', short_name: '' })
  const [nsBusy, setNsBusy] = useState(false)
  const [nsErr, setNsErr] = useState('')
  async function saveSupplier() {
    if (!ns.name.trim()) { setNsErr('Informe o nome.'); return }
    setNsBusy(true); setNsErr('')
    const r = await fetch('/api/suppliers', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: ns.name.trim(), short_name: ns.short_name.trim() || null }),
    })
    const d = await r.json().catch(() => ({}))
    if (!r.ok || !d.id) { setNsErr(d.error || 'Erro ao criar fornecedor.'); setNsBusy(false); return }
    const opt: Opt = { id: d.id, name: ns.short_name.trim() || ns.name.trim() }
    setSups(prev => [...prev, opt].sort((a, b) => a.name.localeCompare(b.name)))
    set('supplier_id', d.id)
    setNs({ name: '', short_name: '' }); setNsOpen(false); setNsBusy(false)
  }

  const load = useCallback(async () => {
    const r = await fetch('/api/despesas'); const d = await r.json()
    setList(Array.isArray(d) ? d : [])
  }, [])
  useEffect(() => { load() }, [load])

  // Centros de custo (units) da unidade selecionada
  const unitsForUnidade = units.filter(u => form.unidade_id && u.unidade_id === form.unidade_id)

  function edit(d: any) {
    setForm({
      id: d.id, supplier_id: d.supplier_id ?? '', unidade_id: d.unidade_id ?? '', unit_id: d.unit_id ?? '',
      cost_class: d.cost_class ?? '', value: d.value ?? '', year: d.year ?? DEFAULT_YEAR,
      month: d.month ?? (new Date().getMonth() + 1), notes: d.notes ?? '',
    })
    setErr('')
  }
  const reset = () => { setForm({ ...empty }); setErr('') }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!form.supplier_id) { setErr('Fornecedor é obrigatório.'); return }
    setSaving(true); setErr('')
    const payload = {
      ...(form.id ? { id: form.id } : {}),
      supplier_id: form.supplier_id, unidade_id: form.unidade_id || null, unit_id: form.unit_id || null,
      cost_class: form.cost_class || null,
      value: form.value === '' ? null : Number(String(form.value).replace(/\./g, '').replace(',', '.')),
      year: form.year, month: form.month, notes: form.notes || null,
    }
    const res = await fetch('/api/despesas', {
      method: form.id ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    })
    const d = await res.json().catch(() => ({}))
    if (res.ok) { reset(); await load() } else setErr(d.error || 'Erro ao salvar.')
    setSaving(false)
  }

  async function del(id: string) {
    if (!confirm('Excluir esta despesa?')) return
    await fetch('/api/despesas', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    load()
  }

  return (
    <div className="page">
      <div className="mb-6">
        <h1 className="page-title">Despesa</h1>
        <p className="text-sm text-slate-500">Cadastro de despesas por fornecedor, unidade e centro de custo.</p>
      </div>

      <GuideCard storageKey="/cadastros/despesa"
        steps={[
          'Selecione o Fornecedor e o Tipo da despesa (CAPEX / OPEX / OPEX OTC).',
          'Escolha a Unidade — o campo Centro de Custo passa a listar só os CCs daquela unidade.',
          'Informe Valor e Competência (mês/ano). O Código (DSP-…) é gerado automaticamente ao salvar.',
        ]}
        note="A Unidade e o Centro de Custo precisam já estar cadastrados (menu Unidades / Centro de Custo). Não achou o Fornecedor? Use o botão + ao lado do campo para cadastrá-lo na hora."
      />

      <form onSubmit={save} className="card p-5 mb-6">
        <p className="text-sm font-semibold text-slate-700 mb-3">{form.id ? 'Editar despesa' : 'Nova despesa'}</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="label">Código</label>
            <input className="input bg-slate-50 text-slate-500" value={form.id ? (list.find(x => x.id === form.id)?.code || '—') : 'automático'} readOnly />
          </div>
          <div>
            <label className="label">Fornecedor *</label>
            <div className="flex gap-1.5">
              <select className="input flex-1" value={form.supplier_id} onChange={e => set('supplier_id', e.target.value)} required>
                <option value="">Selecione…</option>{sups.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <button type="button" onClick={() => { setNsOpen(true); setNsErr('') }} title="Novo fornecedor" className="btn-secondary px-2.5"><Plus className="w-4 h-4" /></button>
            </div>
          </div>
          <div>
            <label className="label">Tratamento (OPEX/CAPEX)</label>
            <select className="input" value={form.cost_class} onChange={e => set('cost_class', e.target.value)}>
              <option value="">—</option>{COST_CLASSES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Unidade</label>
            <select className="input" value={form.unidade_id} onChange={e => { set('unidade_id', e.target.value); set('unit_id', '') }}>
              <option value="">—</option>{unidades.map(u => <option key={u.id} value={u.id}>{u.code} — {u.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Centro de Custo</label>
            <select className="input" value={form.unit_id} onChange={e => set('unit_id', e.target.value)} disabled={!form.unidade_id}>
              <option value="">{form.unidade_id ? '—' : 'Selecione a unidade primeiro'}</option>
              {unitsForUnidade.map(u => <option key={u.id} value={u.id}>{u.code} — {u.name}</option>)}
            </select>
            {form.unidade_id && unitsForUnidade.length === 0 && <p className="mt-1 text-[11px] text-amber-600">Nenhum centro de custo associado a esta unidade.</p>}
          </div>
          <div>
            <label className="label">Valor</label>
            <input className="input text-right font-mono" placeholder="0,00" value={form.value} onChange={e => set('value', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="label">Mês</label>
              <select className="input" value={form.month} onChange={e => set('month', +e.target.value)}>{MONTHS_PT.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}</select>
            </div>
            <div><label className="label">Ano</label>
              <select className="input" value={form.year} onChange={e => set('year', +e.target.value)}>{yearOptions().map(y => <option key={y} value={y}>{y}</option>)}</select>
            </div>
          </div>
          <div className="md:col-span-2"><label className="label">Observações</label><input className="input" value={form.notes} onChange={e => set('notes', e.target.value)} /></div>
        </div>
        {err && <p className="mt-3 text-sm text-red-600">{err}</p>}
        <div className="mt-4 flex items-center gap-2">
          <button type="submit" className="btn-primary flex items-center gap-1.5" disabled={saving}>
            {form.id ? <><Pencil className="w-4 h-4" /> Atualizar</> : <><Plus className="w-4 h-4" /> Adicionar despesa</>}
          </button>
          {form.id && <button type="button" className="btn-secondary" onClick={reset}>Cancelar edição</button>}
        </div>
      </form>

      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-sm font-semibold text-slate-800">Despesas ({shown.length}{shown.length !== list.length ? ` de ${list.length}` : ''})</h2>
          <div className="relative w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input className="input h-8 text-sm pl-9" placeholder="Buscar despesa…" value={q} onChange={e => setQ(e.target.value)} />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="tbl w-full text-sm">
            <thead><tr className="text-xs text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-100">
              <th className="text-left px-4 py-2.5 font-medium">Código</th>
              <th className="text-left px-4 py-2.5 font-medium">Fornecedor</th>
              <th className="text-left px-4 py-2.5 font-medium">Unidade</th>
              <th className="text-left px-4 py-2.5 font-medium">Centro de Custo</th>
              <th className="text-left px-4 py-2.5 font-medium">Tratamento</th>
              <th className="text-right px-4 py-2.5 font-medium">Valor</th>
              <th className="text-center px-4 py-2.5 font-medium">Compet.</th>
              <th className="px-4 py-2.5" />
            </tr></thead>
            <tbody className="divide-y divide-slate-50">
              {shown.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">{q.trim() ? 'Nada encontrado' : 'Nenhuma despesa'}</td></tr>}
              {shown.map(d => (
                <tr key={d.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{d.code}</td>
                  <td className="px-4 py-2.5 text-slate-700">{d.supplier_name || '—'}</td>
                  <td className="px-4 py-2.5 text-slate-600 text-xs">{d.unidade_code ? `${d.unidade_code} — ${d.unidade_name}` : '—'}</td>
                  <td className="px-4 py-2.5 text-slate-600 text-xs">{d.unit_code ? `${d.unit_code} — ${d.unit_name}` : '—'}</td>
                  <td className="px-4 py-2.5 text-slate-500 text-xs">{COST_CLASSES.find(c => c.value === d.cost_class)?.label || '—'}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs text-slate-700">{d.value != null ? BRL(Number(d.value)) : '—'}</td>
                  <td className="px-4 py-2.5 text-center text-xs text-slate-500">{d.month && d.year ? `${String(d.month).padStart(2, '0')}/${d.year}` : '—'}</td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <button onClick={() => edit(d)} className="text-slate-400 hover:text-blue-600 mr-2 align-middle"><Pencil className="w-4 h-4 inline" /></button>
                    <button onClick={() => del(d.id)} className="text-slate-400 hover:text-red-600 align-middle"><Trash2 className="w-4 h-4 inline" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {nsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setNsOpen(false)}>
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-navy-800">Novo fornecedor</h3>
              <button onClick={() => setNsOpen(false)} className="text-slate-400 hover:text-slate-700"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-3">
              <div><label className="label">Nome *</label><input className="input" autoFocus value={ns.name} onChange={e => setNs(s => ({ ...s, name: e.target.value }))} /></div>
              <div><label className="label">Abreviação</label><input className="input" value={ns.short_name} onChange={e => setNs(s => ({ ...s, short_name: e.target.value }))} placeholder="opcional" /></div>
              {nsErr && <p className="text-sm text-red-600">{nsErr}</p>}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setNsOpen(false)} className="btn-secondary">Cancelar</button>
              <button onClick={saveSupplier} className="btn-primary" disabled={nsBusy}>{nsBusy ? 'Salvando…' : 'Criar e selecionar'}</button>
            </div>
            <p className="mt-3 text-[11px] text-slate-400">Cadastro rápido (nome + abreviação). Outros detalhes podem ser completados depois.</p>
          </div>
        </div>
      )}
    </div>
  )
}
