'use client'
import { useState, useEffect, useCallback } from 'react'
import { yearOptions, DEFAULT_YEAR } from '@/lib/years'
import { RefreshCw, Check } from 'lucide-react'
import GuideCard from '@/components/GuideCard'
import clsx from 'clsx'

interface Opt { id: string; code?: string; name: string }
interface Row { country_id: string; country_name: string; currency_id: string | null; currency_code: string | null; usd_rate: string | null }

export default function ExchangeClient({ currencies }: { currencies: Opt[] }) {
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
          <h1 className="page-title">Câmbio por País</h1>
          <p className="text-sm text-slate-500">Moeda local e taxa do dólar (quanto da moeda local vale 1 USD) — ano {year}</p>
        </div>
        <div className="flex items-center gap-2">
          <select className="input w-24 text-sm" value={year} onChange={e => setYear(+e.target.value)}>
            {yearOptions().map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={load} className="btn-secondary" disabled={loading}><RefreshCw className={clsx('w-4 h-4', loading && 'animate-spin')} /></button>
        </div>
      </div>

      <GuideCard storageKey="/cadastros/cambio"
        steps={[
          'Selecione o ano no seletor acima.',
          'Para cada país, informe a moeda local e a taxa do dólar (quanto da moeda local vale 1 USD).',
          'As taxas consolidam os valores em USD nos relatórios.',
        ]}
        note="Cadastre antes os Países e as Moedas." />

      <div className="card overflow-hidden">
        <table className="tbl w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100 text-xs font-medium text-slate-500">
              <th className="text-left px-4 py-2">País</th>
              <th className="text-left px-4 py-2">Moeda local</th>
              <th className="text-right px-4 py-2">Taxa USD (local por 1 USD)</th>
              <th className="px-4 py-2 w-20" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {rows.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">{loading ? 'Carregando…' : 'Cadastre países primeiro'}</td></tr>}
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
      <p className="text-xs text-slate-400 mt-3">Ex.: Brasil → BRL, taxa 5,88 (R$ 5,88 por US$ 1). Usado para visões em moeda local e em USD.</p>
    </div>
  )
}
