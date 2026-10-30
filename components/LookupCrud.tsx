'use client'
import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { Plus, Trash2, Upload, Download, Pencil, X, Search } from 'lucide-react'
import clsx from 'clsx'
import { csvDownload, readTable } from '@/lib/csv'
import GuideCard from '@/components/GuideCard'

interface Item { id: string; code: string; name: string; description?: string | null; is_active: boolean;[k: string]: any }
type ExtraField = { key: string; label: string; options: { value: string; label: string }[] }

export default function LookupCrud({ endpoint, title, subtitle, hasDescription = false, guideSteps, guideNote, extraFields = [], teach }: {
  endpoint: string; title: string; subtitle?: string; hasDescription?: boolean
  guideSteps?: string[]; guideNote?: string; extraFields?: ExtraField[]
  teach?: { what: string; example?: string }
}) {
  const t = useTranslations('lookup')
  const tc = useTranslations('common')
  const [items, setItems] = useState<Item[]>([])
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [extras, setExtras] = useState<Record<string, string>>({})
  const [editId, setEditId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [impMsg, setImpMsg] = useState('')
  const [q, setQ] = useState('')
  const nq = (s: any) => String(s ?? '').toLowerCase()
  const shown = q.trim()
    ? items.filter(it => [it.code, it.name, it.description, ...extraFields.map(f => extraFields.find(x => x.key === f.key)?.options.find(o => o.value === it[f.key])?.label)].some(v => nq(v).includes(nq(q))))
    : items
  type Prev = { code: string; name: string; description?: string; status: 'new' | 'dup' | 'invalid' }
  const [preview, setPreview] = useState<Prev[] | null>(null)
  const [previewName, setPreviewName] = useState('')
  const [importing, setImporting] = useState(false)

  const load = useCallback(async () => {
    const r = await fetch(endpoint)
    const d = await r.json()
    setItems(Array.isArray(d) ? d : [])
  }, [endpoint])
  useEffect(() => { load() }, [load])
  useEffect(() => { if (impMsg || err) window.scrollTo({ top: 0, behavior: 'smooth' }) }, [impMsg, err])

  function resetForm() { setCode(''); setName(''); setDesc(''); setExtras({}); setEditId(null); setErr('') }
  function startEdit(it: Item) {
    setEditId(it.id); setCode(it.code); setName(it.name); setDesc(it.description || '')
    { const ex: Record<string, string> = {}; for (const f of extraFields) ex[f.key] = it[f.key] || ''; setExtras(ex) }
    setErr('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!code.trim() || !name.trim()) { setErr(t('reqCodeName')); return }
    setSaving(true); setErr('')
    const payload: any = { code: code.trim(), name: name.trim() }
    if (hasDescription) payload.description = desc.trim() || null
    for (const f of extraFields) payload[f.key] = extras[f.key] || null
    if (editId) payload.id = editId
    const r = await fetch(endpoint, {
      method: editId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) setErr(d.error || tc('saveError'))
    else { resetForm(); load() }
    setSaving(false)
  }

  async function toggle(it: Item) {
    await fetch(endpoint, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: it.id, is_active: !it.is_active }) })
    load()
  }
  async function remove(it: Item) {
    if (!confirm(t('confirmDelete', { name: it.name }))) return
    const r = await fetch(endpoint, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: it.id }) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) alert(d.error || t('deleteUsed'))
    load()
  }

  function downloadTemplate() {
    const header = hasDescription ? 'codigo,nome,descricao' : 'codigo,nome'
    const ex = hasDescription ? ['EX1,Exemplo 1,Descrição opcional', 'EX2,Exemplo 2,'] : ['EX1,Exemplo 1', 'EX2,Exemplo 2']
    csvDownload('modelo_cadastro.csv', header, ex)
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setErr(''); setImpMsg('')
    const { headers, rows: data } = await readTable(file)
    const iC = headers.findIndex(h => ['codigo', 'code', 'cod'].includes(h))
    const iN = headers.findIndex(h => ['nome', 'name'].includes(h))
    const iD = headers.findIndex(h => ['descricao', 'description', 'desc'].includes(h))
    if (iC < 0 || iN < 0) { setErr(t('csvInvalid')); e.target.value = ''; return }
    const nc = (s: string) => String(s || '').trim().toLowerCase()
    const existing = new Set(items.map(i => nc(i.code)))
    const rows: Prev[] = data.map(r => {
      const code = (r[iC] || '').trim(), name = (r[iN] || '').trim()
      const description = hasDescription && iD >= 0 ? ((r[iD] || '').trim() || undefined) : undefined
      const status: Prev['status'] = (!code || !name) ? 'invalid' : existing.has(nc(code)) ? 'dup' : 'new'
      return { code, name, description, status }
    })
    setPreview(rows); setPreviewName(file.name); e.target.value = ''
  }

  async function doImport() {
    if (!preview) return
    setImporting(true)
    let ok = 0, fail = 0
    for (const r of preview.filter(p => p.status === 'new')) {
      const body: any = { code: r.code, name: r.name }
      if (hasDescription) body.description = r.description ?? null
      const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      res.ok ? ok++ : fail++
    }
    const dup = preview.filter(p => p.status === 'dup').length
    const inv = preview.filter(p => p.status === 'invalid').length
    setImporting(false); setPreview(null); setPreviewName('')
    setImpMsg(`${t('impPrefix')} ${t('impCreated', { n: ok })}${fail ? t('impErr', { n: fail }) : ''}${dup ? t('impDup', { n: dup }) : ''}${inv ? t('impInvalid', { n: inv }) : ''}.`)
    load()
  }

  return (
    <div className="page">
      <div className="mb-5 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{title}</h1>
          {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={downloadTemplate} className="btn-secondary text-sm flex items-center gap-1.5">
            <Download className="w-4 h-4" /> {t('modelCsv')}
          </button>
          <label className="btn-secondary text-sm flex items-center gap-1.5 cursor-pointer">
            <Upload className="w-4 h-4" /> {t('importCsv')}
            <input type="file" accept=".csv,.txt,.xlsx,.xls" className="hidden" onChange={handleImport} />
          </label>
        </div>
      </div>
      {impMsg && <p className="text-sm text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2 mb-4">{impMsg}</p>}

      {preview && (() => {
        const nNew = preview.filter(p => p.status === 'new').length
        const nDup = preview.filter(p => p.status === 'dup').length
        const nInv = preview.filter(p => p.status === 'invalid').length
        return (
          <div className="card p-4 mb-5 border border-blue-100">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="text-sm font-semibold text-slate-800">{t('preview')}</span>
              <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">{t('nNew', { n: nNew })}</span>
              {nDup > 0 && <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">{t('nDup', { n: nDup })}</span>}
              {nInv > 0 && <span className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full">{t('nInv', { n: nInv })}</span>}
              <span className="text-xs text-slate-400 ml-auto">{previewName}</span>
            </div>
            <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-100 divide-y divide-slate-50">
              {preview.slice(0, 50).map((p, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                  <span className={clsx('w-2 h-2 rounded-full shrink-0',
                    p.status === 'new' ? 'bg-emerald-500' : p.status === 'dup' ? 'bg-amber-500' : 'bg-red-500')} />
                  <span className="font-mono text-slate-600">{p.code || t('noCode')}</span>
                  <span className="text-slate-700 truncate">{p.name || t('noName')}</span>
                  {hasDescription && p.description && <span className="text-slate-400 truncate">· {p.description}</span>}
                </div>
              ))}
              {preview.length > 50 && <div className="px-3 py-1.5 text-xs text-slate-400">{t('moreLines', { n: preview.length - 50 })}</div>}
            </div>
            <div className="flex justify-end gap-2 mt-3">
              <button type="button" onClick={() => { setPreview(null); setPreviewName('') }} className="btn-secondary text-sm">{tc('cancel')}</button>
              <button type="button" onClick={doImport} disabled={importing || nNew === 0} className="btn-primary text-sm flex items-center gap-1.5">
                <Upload className="w-4 h-4" /> {importing ? t('importing') : t('importNew', { n: nNew })}
              </button>
            </div>
          </div>
        )
      })()}

      <GuideCard storageKey={endpoint}
        steps={guideSteps || [
          t('guideStep1', { title }),
          t('guideStep2'),
          t('guideStep3'),
        ]}
        note={guideNote || t('guideNote')}
      />

      <form onSubmit={submit} className="card p-4 mb-5 flex flex-wrap items-end gap-3">
        <div className="w-32">
          <label className="label">{t('code')}</label>
          <input className="input" value={code} onChange={e => setCode(e.target.value)} placeholder="EX: SW" />
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="label">{t('name')}</label>
          <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder={t('namePh')} />
        </div>
        {hasDescription && (
          <div className="flex-1 min-w-[180px]">
            <label className="label">{t('descr')}</label>
            <input className="input" value={desc} onChange={e => setDesc(e.target.value)} placeholder={t('descPh')} />
          </div>
        )}
        {extraFields.map(f => (
          <div key={f.key} className="w-48">
            <label className="label">{f.label}</label>
            <select className="input" value={extras[f.key] || ''} onChange={e => setExtras(s => ({ ...s, [f.key]: e.target.value }))}>
              <option value="">—</option>
              {f.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        ))}
        <button className="btn-primary flex items-center gap-1.5" disabled={saving}>
          <Plus className="w-4 h-4" /> {saving ? tc('save') + '…' : editId ? tc('save') : t('add')}
        </button>
        {editId && (
          <button type="button" onClick={resetForm} className="btn-secondary flex items-center gap-1.5">
            <X className="w-4 h-4" /> {tc('cancel')}
          </button>
        )}
      </form>
      {err && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-4">{err}</p>}

      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input className="input pl-9" placeholder={t('searchIn', { title: title.toLowerCase() })} value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <span className="text-xs text-slate-400">{t('shownOf', { shown: shown.length, total: items.length })}</span>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100 text-xs font-medium text-slate-500">
              <th className="text-left px-4 py-2">{t('code')}</th>
              <th className="text-left px-4 py-2">{t('name')}</th>
              {hasDescription && <th className="text-left px-4 py-2">{t('descr')}</th>}
              {extraFields.map(f => <th key={f.key} className="text-left px-4 py-2">{f.label}</th>)}
              <th className="text-center px-4 py-2">{t('colActive')}</th>
              <th className="px-4 py-2 w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {shown.length === 0 && (
              <tr><td colSpan={4 + (hasDescription ? 1 : 0) + extraFields.length} className="px-4 py-8 text-center">
                {q.trim() ? <span className="text-slate-400">{t('nothingFound')}</span>
                  : teach ? (
                    <div className="text-slate-500 max-w-md mx-auto">
                      <p className="font-semibold text-slate-700">{t('teachEmpty', { what: teach.what })}</p>
                      {teach.example && <p className="text-sm mt-1">{teach.example}</p>}
                      <p className="text-xs text-slate-400 mt-2">{t('teachHint')}</p>
                    </div>
                  ) : <span className="text-slate-400">{tc('none')}</span>}
              </td></tr>
            )}
            {shown.map(it => (
              <tr key={it.id} className={clsx('hover:bg-slate-50', !it.is_active && 'opacity-50')}>
                <td className="px-4 py-2.5 font-mono text-xs text-slate-600">{it.code}</td>
                <td className="px-4 py-2.5 text-slate-800">{it.name}</td>
                {hasDescription && <td className="px-4 py-2.5 text-slate-500 text-xs">{it.description || '—'}</td>}
                {extraFields.map(f => <td key={f.key} className="px-4 py-2.5">
                  {it[f.key]
                    ? <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">{f.options.find(o => o.value === it[f.key])?.label || it[f.key]}</span>
                    : <span className="text-slate-300 text-xs">—</span>}
                </td>)}
                <td className="px-4 py-2.5 text-center">
                  <button onClick={() => toggle(it)}
                    className={clsx('px-2 py-0.5 rounded-full text-xs font-medium', it.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500')}>
                    {it.is_active ? tc('yes') : tc('no')}
                  </button>
                </td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                  <button onClick={() => startEdit(it)} className="p-1 text-slate-400 hover:text-blue-600"><Pencil className="w-4 h-4" /></button>
                  <button onClick={() => remove(it)} className="p-1 text-slate-400 hover:text-red-500 ml-1"><Trash2 className="w-4 h-4" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
