'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { LineChart, Download, AlertTriangle, RefreshCw, ArrowLeft, Wallet, TrendingUp, Scale } from 'lucide-react'
import { csvDownload } from '@/lib/csv'
import { yearOptions, DEFAULT_YEAR } from '@/lib/years'
import { StatHeroRow, signVariant } from '@/components/StatHero'

type Row = { id: string; code: string; name: string; orcado_fy: number; realizado: number; budget_restante: number }
const MESES = ['—', 'jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

export default function ForecastClient() {
  const [year, setYear] = useState(DEFAULT_YEAR)
  const [usd, setUsd] = useState(false)
  const [rows, setRows] = useState<Row[]>([])
  const [cutoff, setCutoff] = useState(0)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const cur = usd ? 'USD' : 'BRL'
  const money = (n: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(n || 0)

  const load = useCallback(async () => {
    setLoading(true); setErr('')
    try {
      const p = new URLSearchParams({ year: String(year) }); if (usd) p.set('usd', '1')
      const r = await fetch(`/api/report/forecast?${p}`); const d = await r.json()
      if (d?.error) setErr(d.error); else { setRows(Array.isArray(d.rows) ? d.rows : []); setCutoff(d.cutoff || 0) }
    } catch (e: any) { setErr(e?.message || 'Erro ao carregar.') }
    setLoading(false)
  }, [year, usd])
  useEffect(() => { load() }, [load])

  const data = useMemo(() => rows.map(r => {
    const forecast = (Number(r.realizado) || 0) + (Number(r.budget_restante) || 0)
    const desvio = forecast - (Number(r.orcado_fy) || 0)
    return { ...r, forecast, desvio }
  }), [rows])

  const tot = useMemo(() => data.reduce((a, r) => ({
    orcado_fy: a.orcado_fy + r.orcado_fy, realizado: a.realizado + r.realizado,
    budget_restante: a.budget_restante + r.budget_restante, forecast: a.forecast + r.forecast, desvio: a.desvio + r.desvio,
  }), { orcado_fy: 0, realizado: 0, budget_restante: 0, forecast: 0, desvio: 0 }), [data])

  function exportCSV() {
    const header = 'unidade_codigo,unidade,orcado_fy,realizado,budget_restante,forecast_fy,desvio'
    const esc = (s: any) => { const v = String(s ?? ''); return /[",;\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v }
    const body = data.map(r => [r.code, r.name, r.orcado_fy.toFixed(2), r.realizado.toFixed(2), r.budget_restante.toFixed(2), r.forecast.toFixed(2), r.desvio.toFixed(2)].map(esc).join(','))
    csvDownload(`forecast_${year}.csv`, header, body)
  }

  return (
    <div className="page">
      <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
        <div>
          <Link href="/report" className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1 mb-1"><ArrowLeft className="w-3 h-3" /> Relatórios</Link>
          <h1 className="page-title flex items-center gap-2"><LineChart className="w-5 h-5 text-blue-600" /> Forecast FY</h1>
          <p className="text-sm text-slate-500 max-w-2xl">Reprojeção do ano = <b>Realizado</b> dos meses fechados <b>+ Budget</b> dos meses em aberto. Corte no mês <b>{MESES[cutoff] || '—'}</b> (realizado até ele, budget depois).</p>
        </div>
        <div className="flex items-end gap-2 flex-wrap">
          <div><label className="label">Ano</label>
            <select className="input w-24 text-sm" value={year} onChange={e => setYear(+e.target.value)}>{yearOptions().map(y => <option key={y} value={y}>{y}</option>)}</select>
          </div>
          <div><label className="label">Moeda</label>
            <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs h-9">
              <button type="button" onClick={() => setUsd(false)} className={`px-3 font-medium ${!usd ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>BRL</button>
              <button type="button" onClick={() => setUsd(true)} className={`px-3 font-medium border-l border-slate-200 ${usd ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>USD</button>
            </div>
          </div>
          <button onClick={load} className="btn-secondary text-sm flex items-center gap-1.5"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar</button>
          <button onClick={exportCSV} disabled={!data.length} className="btn-secondary text-sm flex items-center gap-1.5"><Download className="w-4 h-4" /> CSV</button>
        </div>
      </div>

      {err && <div className="mb-4 flex items-center gap-2 px-4 py-2 rounded-lg text-sm bg-red-50 text-red-700"><AlertTriangle className="w-4 h-4" /> {err}</div>}

      <StatHeroRow className="mb-5" tiles={[
        { label: 'Orçado FY', value: money(tot.orcado_fy), variant: 'navy', Icon: Wallet },
        { label: 'Realizado (fechado)', value: money(tot.realizado), variant: 'teal', Icon: TrendingUp },
        { label: 'Forecast FY', value: money(tot.forecast), variant: 'blue', Icon: LineChart },
        { label: 'Desvio vs Orçado', value: (tot.desvio >= 0 ? '+' : '') + money(tot.desvio), variant: signVariant(tot.desvio > 0), Icon: Scale },
      ]} />

      <div className="card overflow-hidden rounded-2xl shadow-sm">
        <div className="overflow-x-auto">
          <table className="tbl w-full text-sm [&_td]:px-4 [&_td]:py-2.5">
            <thead><tr>
              <th className="text-left">Unidade</th>
              <th className="text-right">Orçado FY</th>
              <th className="text-right">Realizado</th>
              <th className="text-right">Budget restante</th>
              <th className="text-right">Forecast FY</th>
              <th className="text-right">Desvio</th>
            </tr></thead>
            <tbody>
              {!loading && data.length === 0 && <tr><td colSpan={6} className="px-3 py-10 text-center text-slate-400">Sem dados.</td></tr>}
              {data.map(r => (
                <tr key={r.id}>
                  <td><span className="font-mono text-xs text-slate-500">{r.code}</span> — {r.name}</td>
                  <td className="text-right font-mono tabular-nums text-slate-700">{money(r.orcado_fy)}</td>
                  <td className="text-right font-mono tabular-nums text-slate-600">{money(r.realizado)}</td>
                  <td className="text-right font-mono tabular-nums text-slate-500">{money(r.budget_restante)}</td>
                  <td className="text-right font-mono tabular-nums text-blue-700 font-semibold">{money(r.forecast)}</td>
                  <td className={`text-right font-mono tabular-nums ${r.desvio > 0 ? 'text-red-600' : r.desvio < 0 ? 'text-emerald-600' : 'text-slate-400'}`}>{money(r.desvio)}</td>
                </tr>
              ))}
            </tbody>
            {data.length > 0 && (
              <tfoot><tr className="bg-slate-50 font-semibold text-slate-800">
                <td className="px-4 py-2.5 text-xs uppercase">Total</td>
                <td className="text-right font-mono tabular-nums">{money(tot.orcado_fy)}</td>
                <td className="text-right font-mono tabular-nums">{money(tot.realizado)}</td>
                <td className="text-right font-mono tabular-nums">{money(tot.budget_restante)}</td>
                <td className="text-right font-mono tabular-nums text-blue-700">{money(tot.forecast)}</td>
                <td className={`text-right font-mono tabular-nums ${tot.desvio > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{money(tot.desvio)}</td>
              </tr></tfoot>
            )}
          </table>
        </div>
      </div>
      {loading && <div className="text-sm text-slate-400 py-8 text-center">Carregando…</div>}
    </div>
  )
}
