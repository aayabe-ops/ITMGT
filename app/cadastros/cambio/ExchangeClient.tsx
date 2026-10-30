'use client'
import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { yearOptions, DEFAULT_YEAR } from '@/lib/years'
import { RefreshCw, Check } from 'lucide-react'
import GuideCard from '@/components/GuideCard'
import clsx from 'clsx'

interface Opt { id: string; code?: string; name: string }
interface Row { country_id: string; country_name: string; currency_id: string | null; currency_code: string | null; usd_rate: string | null }

export default function ExchangeClient({ currencies }: { currencies: Opt[] }) {
  const t = useTranslations('cad')
  const tc = useTranslations('common')
  const [year, setYear] = useState(DEFAULT_YEAR)
  const [rows, setRows] = useState<Row[]>([])
  const [draft, setDraft] = useState<Record<string, { currency_id: string; usd_rate: string }>>({})
  const [loading, setLoading] = useState(false)
  const [savedId, setSavedId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch(`/api/exchange?year=${year}`); const d = await r.json()
    const list: Row[] = Array.isArray(d) ? d : []
    setRows(list)
    const dr: any = {}
    for (const x of list) dr[x.country_id] = { currency_id: x.currency_id || '', usd_rate: x.usd_rate != null ? String(x.usd_rate) : '' }
    setDraft(dr)
    setLoading(false)
  }, [year])
  useEffect(() => { load() }, [load])

  const set = (cid: string, k: 'currency_id' | 'usd_rate', v: string) =>
    setDraft(d => ({ ...d, [cid]: { ...d[cid], [k]: v } }))

  async function save(cid: string) {
    const d = draft[cid]
    await fetch('/api/exchange', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ country_id: cid, year, currency_id: d.currency_id || null, usd_rate: d.usd_rate }),
    })
    setSavedId(cid); setTimeout(() => setSavedId(null), 1500); load()
  }

  return (
    <div className="page">
      <div className="mb-5 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="page-title">{t('exTitle')}</h1>
          <p className="text-sm text-slate-500">{t('exSub', { year: String(year) })}</p>
        </div>
        <div className="flex items-center gap-2">
          <select className="input w-24 text-sm" value={year} onChange={e => setYear(+e.target.value)}>
            {yearOptions().map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={load} className="btn-secondary" disabled={loading}><RefreshCw className={clsx('w-4 h-4', loading && 'animate-spin')} /></button>
        </div>
      </div>

      <GuideCard storageKey="/cadastros/cambio"
        steps={[t('exStep1'), t('exStep2'), t('exStep3')]}
        note={t('exNote')} />

      <div className="card overflow-hidden">
        <table className="tbl w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100 text-xs font-medium text-slate-500">
              <th className="text-left px-4 py-2">{t('exColCountry')}</th>
              <th className="text-left px-4 py-2">{t('exColCurrency')}</th>
              <th className="text-right px-4 py-2">{t('exColRate')}</th>
              <th className="px-4 py-2 w-20" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {rows.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">{loading ? tc('loading') : t('exEmpty')}</td></tr>}
            {rows.map(r => {
              const d = draft[r.country_id] || { currency_id: '', usd_rate: '' }
              return (
                <tr key={r.country_id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 text-slate-800">{r.country_name}</td>
                  <td className="px-4 py-2.5">
                    <select className="input text-sm w-40" value={d.currency_id} onChange={e => set(r.country_id, 'currency_id', e.target.value)}>
                      <option value="">—</option>
                      {currencies.map(c => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <input className="input text-sm text-right w-32 font-mono" placeholder="0,000000"
                      value={d.usd_rate} onChange={e => set(r.country_id, 'usd_rate', e.target.value.replace(',', '.'))} />
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button onClick={() => save(r.country_id)} className={clsx('p-1.5 rounded-lg', savedId === r.country_id ? 'text-emerald-600' : 'text-slate-400 hover:text-blue-600')}>
                      <Check className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400 mt-3">{t('exFootnote')}</p>
    </div>
  )
}
