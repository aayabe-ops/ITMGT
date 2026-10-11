'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Wallet, Download, AlertTriangle, RefreshCw, ArrowLeft, TrendingUp, FileSignature, PiggyBank } from 'lucide-react'
import { csvDownload } from '@/lib/csv'
import { yearOptions, DEFAULT_YEAR } from '@/lib/years'
import { StatHeroRow, signVariant } from '@/components/StatHero'

type Row = { id: string; code: string; name: string; orcado: number; realizado: number; comprometido: number }
const MESES = ['—', 'jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

export default function DisponivelClient() {
  const [year, setYear] = useState(DEFAULT_YEAR)
  const [usd, setUsd] = useState(false)
  const [rows, setRows] = useState<Row[]>([])
  const [cutoff, setCutoff] = useState(0)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const cur = usd ? 'USD' : 'BRL'
  const money = (n: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(n || 0)
  const pct = (a: number, b: number) => b === 0 ? '—' : `${Math.round(a / b * 100)}%`

  const load = useCallback(async () => {
    setLoading(true); setErr('')
    try {
      const p = new URLSearchParams({ year: String(year) }); if (usd) p.set('usd', '1')
      const r = await fetch(`/api/report/disponivel?${p}`); const d = await r.json()
      if (d?.error) setErr(d.error); else { setRows(Array.isArray(d.rows) ? d.rows : []); setCutoff(d.cutoff || 0) }
    } catch (e: any) { setErr(e?.message || 'Erro ao carregar.') }
    setLoading(false)
  }, [year, usd])
  useEffect(() => { load() }, [load])

  const data = useMemo(() => rows.map(r => {
    const disponivel = (Number(r.orcado) || 0) - (Number(r.realizado) || 0) - (Number(r.comprometido) || 0)
    const consumido = (Number(r.realizado) || 0) + (Number(r.comprometido) || 0)
    return { ...r, disponivel, consumido }
  }), [rows])

  const tot = useMemo(() => data.reduce((a, r) => ({
    orcado: a.orcado + r.orcado, realizado: a.realizado + r.realizado, comprometido: a.comprometido + r.comprometido,
    disponivel: a.disponivel + r.disponivel, consumido: a.consumido + r.consumido,
  }), { orcado: 0, realizado: 0, comprometido: 0, disponivel: 0, consumido: 0 }), [data])

  function exportCSV() {
    const header = 'unidade_codigo,unidade,orcado,realizado,comprometido,disponivel'
    const esc = (s: any) => { const v = String(s ?? ''); return /[",;\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v }
    const body = data.map(r => [r.code, r.name, r.orcado.toFixed(2), r.realizado.toFixed(2), r.comprometido.toFixed(2), r.disponivel.toFixed(2)].map(esc).join(','))
    csvDownload(`disponivel_${year}.csv`, header, body)
  }

  return (
    <div className="page">
      <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
        <div>
          <Link href="/report" className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1 mb-1"><ArrowLeft className="w-3 h-3" /> Relatórios</Link>
          <h1 className="page-title flex items-center gap-2"><Wallet className="w-5 h-5 text-blue-600" /> Comprometido / Disponível</h1>
          <p className="text-sm text-slate-500 max-w-2xl"><b>Disponível = Orçado − Realizado − Comprometido</b>. Comprometido = contratos ativos nos meses em aberto (após <b>{MESES[cutoff] || '—'}</b>).</p>
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
        { label: 'Orçado', value: money(tot.orcado), variant: 'blue', Icon: Wallet },
        { label: 'Realizado', value: money(tot.realizado), variant: 'teal', Icon: TrendingUp },
        { label: 'Comprometido', value: money(tot.comprometido), variant: 'amber', Icon: FileSignature },
        { label: 'Disponível', value: money(tot.disponivel), variant: signVariant(tot.disponivel < 0), Icon: PiggyBank },
      ]} />

      <div className="card overflow-hidden rounded-2xl shadow-sm">
        <div className="overflow-x-auto">
          <table className="tbl w-full text-sm [&_td]:px-4 [&_td]:py-2.5">
            <thead><tr>
              <th className="text-left">Unidade</th>
              <th className="text-right">Orçado</th>
              <th className="text-right">Realizado</th>
              <th className="text-right">Comprometido</th>
              <th className="text-right">Disponível</th>
              <th className="text-right">Consumido</th>
            </tr></thead>
            <tbody>
              {!loading && data.length === 0 && <tr><td colSpan={6} className="px-3 py-10 text-center text-slate-400">Sem dados.</td></tr>}
              {data.map(r => (
                <tr key={r.id}>
                  <td><span className="font-mono text-xs text-slate-500">{r.code}</span> — {r.name}</td>
                  <td className="text-right font-mono tabular-nums text-slate-700">{money(r.orcado)}</td>
                  <td className="text-right font-mono tabular-nums text-slate-600">{money(r.realizado)}</td>
                  <td className="text-right font-mono tabular-nums text-amber-700">{money(r.comprometido)}</td>
                  <td className={`text-right font-mono tabular-nums font-semibold ${r.disponivel < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{money(r.disponivel)}</td>
                  <td className="text-right font-mono tabular-nums text-slate-500 text-xs">{pct(r.consumido, r.orcado)}</td>
                </tr>
              ))}
            </tbody>
            {data.length > 0 && (
              <tfoot><tr className="bg-slate-50 font-semibold text-slate-800">
                <td className="px-4 py-2.5 text-xs uppercase">Total</td>
                <td className="text-right font-mono tabular-nums">{money(tot.orcado)}</td>
                <td className="text-right font-mono tabular-nums">{money(tot.realizado)}</td>
                <td className="text-right font-mono tabular-nums text-amber-700">{money(tot.comprometido)}</td>
                <td className={`text-right font-mono tabular-nums ${tot.disponivel < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{money(tot.disponivel)}</td>
                <td className="text-right font-mono tabular-nums text-xs">{pct(tot.consumido, tot.orcado)}</td>
              </tr></tfoot>
            )}
          </table>
        </div>
      </div>
      {loading && <div className="text-sm text-slate-400 py-8 text-center">Carregando…</div>}
    </div>
  )
}
