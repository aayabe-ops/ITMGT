'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Warehouse, Download, AlertTriangle, RefreshCw, ArrowLeft, TrendingUp, Share2, Scale } from 'lucide-react'
import { csvDownload } from '@/lib/csv'
import { yearOptions, DEFAULT_YEAR } from '@/lib/years'
import { StatHeroRow, signVariant } from '@/components/StatHero'

type Row = { id: string; code: string; name: string; orcado: number; realizado_direto: number; rateado: number }
const MESES = ['Ano inteiro', 'jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const pct = (a: number, b: number) => b === 0 ? '—' : `${(a / b * 100).toFixed(0)}%`

export default function DespesaUnidadeClient() {
  const [year, setYear] = useState(DEFAULT_YEAR)
  const [month, setMonth] = useState(0) // 0 = ano inteiro (FY); >0 = YTD até o mês
  const [usd, setUsd] = useState(false)
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const curCode = usd ? 'USD' : 'BRL'
  const BRL = (n: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: curCode }).format(n || 0)

  const load = useCallback(async () => {
    setLoading(true); setErr('')
    try {
      const p = new URLSearchParams({ year: String(year) })
      if (month > 0) p.set('month', String(month))
      if (usd) p.set('usd', '1')
      const r = await fetch(`/api/report/despesa-unidade?${p}`); const d = await r.json()
      if (d?.error) setErr(d.error); else setRows(Array.isArray(d.rows) ? d.rows : [])
    } catch (e: any) { setErr(e?.message || 'Erro ao carregar.') }
    setLoading(false)
  }, [year, month, usd])
  useEffect(() => { load() }, [load])

  const data = useMemo(() => rows.map(r => {
    const realizado = (Number(r.realizado_direto) || 0) + (Number(r.rateado) || 0)
    const desvio = realizado - (Number(r.orcado) || 0)
    return { ...r, realizado, desvio }
  }), [rows])

  const tot = useMemo(() => data.reduce((a, r) => ({
    orcado: a.orcado + r.orcado, direto: a.direto + r.realizado_direto, rateado: a.rateado + r.rateado,
    realizado: a.realizado + r.realizado, desvio: a.desvio + r.desvio,
  }), { orcado: 0, direto: 0, rateado: 0, realizado: 0, desvio: 0 }), [data])

  function exportCSV() {
    const header = 'unidade_codigo,unidade,orcado,realizado_direto,rateado,realizado_total,desvio,realizado_vs_orcado_pct'
    const esc = (s: any) => { const v = String(s ?? ''); return /[",;\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v }
    const body = data.map(r => [r.code, r.name, r.orcado.toFixed(2), r.realizado_direto.toFixed(2), r.rateado.toFixed(2),
      r.realizado.toFixed(2), r.desvio.toFixed(2), r.orcado ? (r.realizado / r.orcado * 100).toFixed(0) : ''].map(esc).join(','))
    const sufixo = month > 0 ? `ytd_${String(month).padStart(2, '0')}` : 'ano'
    csvDownload(`despesa_por_unidade_${year}_${sufixo}.csv`, header, body)
  }

  const periodo = month > 0 ? `YTD até ${MESES[month]}` : 'Ano inteiro'

  return (
    <div className="page">
      <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
        <div>
          <Link href="/report" className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1 mb-1"><ArrowLeft className="w-3 h-3" /> Relatórios</Link>
          <h1 className="page-title flex items-center gap-2"><Warehouse className="w-5 h-5 text-blue-600" /> Despesa por Unidade</h1>
          <p className="text-sm text-slate-500">Quanto cada unidade custou de TI — orçado × realizado, separando o que é <b>direto</b> do que veio por <b>rateio</b>.</p>
        </div>
        <div className="flex items-end gap-2 flex-wrap">
          <div><label className="label">Ano</label>
            <select className="input w-24 text-sm" value={year} onChange={e => setYear(+e.target.value)}>{yearOptions().map(y => <option key={y} value={y}>{y}</option>)}</select>
          </div>
          <div><label className="label">Período</label>
            <select className="input w-36 text-sm" value={month} onChange={e => setMonth(+e.target.value)}>{MESES.map((m, i) => <option key={i} value={i}>{m}</option>)}</select>
          </div>
          <div><label className="label">Moeda</label>
            <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs h-9">
              <button type="button" onClick={() => setUsd(false)} className={`px-3 font-medium ${!usd ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>BRL</button>
              <button type="button" onClick={() => setUsd(true)} className={`px-3 font-medium border-l border-slate-200 ${usd ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>USD</button>
            </div>
          </div>
          <button onClick={load} className="btn-secondary text-sm flex items-center gap-1.5"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar</button>
          <button onClick={exportCSV} disabled={!data.length} className="btn-secondary text-sm flex items-center gap-1.5"><Download className="w-4 h-4" /> Exportar CSV</button>
        </div>
      </div>

      {err && <div className="mb-4 flex items-center gap-2 px-4 py-2 rounded-lg text-sm bg-red-50 text-red-700"><AlertTriangle className="w-4 h-4" /> {err}</div>}

      {/* totais */}
      <StatHeroRow className="mb-5" tiles={[
        { label: 'Orçado', value: BRL(tot.orcado), variant: 'navy', Icon: Warehouse },
        { label: 'Realizado', value: BRL(tot.realizado), variant: 'teal', Icon: TrendingUp },
        { label: 'Rateado (incluso)', value: BRL(tot.rateado), variant: 'amber', Icon: Share2 },
        { label: 'Desvio', value: (tot.desvio >= 0 ? '+' : '') + BRL(tot.desvio), variant: signVariant(tot.desvio > 0), Icon: Scale },
      ]} />
      <div className="text-xs text-slate-400 mb-2">{periodo} · {data.length} unidade(s)</div>

      <div className="card overflow-hidden rounded-2xl shadow-sm">
        <div className="overflow-x-auto">
          <table className="tbl w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-[11px] uppercase text-slate-500">
                <th className="text-left px-3 py-2.5">Unidade</th>
                <th className="text-right px-3 py-2.5">Orçado</th>
                <th className="text-right px-3 py-2.5">Realizado direto</th>
                <th className="text-right px-3 py-2.5">Rateado</th>
                <th className="text-right px-3 py-2.5">Realizado total</th>
                <th className="text-right px-3 py-2.5">Desvio</th>
                <th className="text-right px-3 py-2.5">Real / Orç</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {!loading && data.length === 0 && <tr><td colSpan={7} className="px-3 py-10 text-center text-slate-400">Sem dados para o período.</td></tr>}
              {data.map(r => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2.5 text-slate-800"><span className="font-mono text-xs text-slate-500">{r.code}</span> — {r.name}</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-700">{BRL(r.orcado)}</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-600">{BRL(r.realizado_direto)}</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-amber-700">{r.rateado ? BRL(r.rateado) : '—'}</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-800 font-semibold">{BRL(r.realizado)}</td>
                  <td className={`px-3 py-2.5 text-right font-mono tabular-nums ${r.desvio > 0 ? 'text-red-600' : r.desvio < 0 ? 'text-emerald-600' : 'text-slate-400'}`}>{BRL(r.desvio)}</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-500 text-xs">{pct(r.realizado, r.orcado)}</td>
                </tr>
              ))}
            </tbody>
            {data.length > 0 && (
              <tfoot>
                <tr className="bg-slate-50 font-semibold text-slate-800 border-t border-slate-100">
                  <td className="px-3 py-2.5 text-xs uppercase">Total</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums">{BRL(tot.orcado)}</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums">{BRL(tot.direto)}</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-amber-700">{BRL(tot.rateado)}</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums">{BRL(tot.realizado)}</td>
                  <td className={`px-3 py-2.5 text-right font-mono tabular-nums ${tot.desvio > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{BRL(tot.desvio)}</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-xs">{pct(tot.realizado, tot.orcado)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
      {loading && <div className="text-sm text-slate-400 py-8 text-center">Carregando…</div>}
    </div>
  )
}
