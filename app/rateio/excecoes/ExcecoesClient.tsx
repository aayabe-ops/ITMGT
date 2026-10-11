'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, RefreshCw, ArrowLeft, Download, SlidersHorizontal, PlusCircle } from 'lucide-react'
import { csvDownload } from '@/lib/csv'
import { yearOptions, DEFAULT_YEAR } from '@/lib/years'

type Row = {
  supplier_id: string | null; category_id: string | null
  supplier_name: string; category_name: string
  ccs: number; lancamentos: number; total: number; in_budget: boolean
}
const MESES = ['Ano inteiro', 'jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

export default function ExcecoesClient() {
  const [year, setYear] = useState(DEFAULT_YEAR)
  const [month, setMonth] = useState(0)
  const [usd, setUsd] = useState(false)
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const cur = usd ? 'USD' : 'BRL'
  const money = (n: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: cur }).format(n || 0)

  const load = useCallback(async () => {
    setLoading(true); setErr('')
    try {
      const p = new URLSearchParams({ year: String(year) })
      if (month > 0) p.set('month', String(month))
      if (usd) p.set('usd', '1')
      const r = await fetch(`/api/rateio/excecoes?${p}`); const d = await r.json()
      if (d?.error) setErr(d.error); else setRows(Array.isArray(d.rows) ? d.rows : [])
    } catch (e: any) { setErr(e?.message || 'Erro ao carregar.') }
    setLoading(false)
  }, [year, month, usd])
  useEffect(() => { load() }, [load])

  const foraBudget = useMemo(() => rows.filter(r => !r.in_budget), [rows])
  const tot = useMemo(() => ({
    total: rows.reduce((a, r) => a + (r.total || 0), 0),
    fora: foraBudget.reduce((a, r) => a + (r.total || 0), 0),
  }), [rows, foraBudget])

  function exportCSV() {
    const header = 'fornecedor,categoria,centros_custo,lancamentos,total,status'
    const esc = (s: any) => { const v = String(s ?? ''); return /[",;\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v }
    const body = rows.map(r => [r.supplier_name, r.category_name, r.ccs, r.lancamentos,
      (r.total || 0).toFixed(2), r.in_budget ? 'No budget' : 'Fora do budget'].map(esc).join(','))
    const sufixo = month > 0 ? String(month).padStart(2, '0') : 'ano'
    csvDownload(`excecoes_realizado_${year}_${sufixo}.csv`, header, body)
  }

  const periodo = month > 0 ? MESES[month] : 'Ano inteiro'

  return (
    <div className="page">
      <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
        <div>
          <Link href="/rateio" className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1 mb-1"><ArrowLeft className="w-3 h-3" /> Rateio</Link>
          <h1 className="page-title flex items-center gap-2"><SlidersHorizontal className="w-5 h-5 text-bordeaux-600" /> Exceções do Realizado</h1>
          <p className="text-sm text-slate-500 max-w-2xl">Despesas realizadas <b>direto</b> (sem regra de rateio que case). As marcadas <b>Fora do budget</b> são gastos que não estavam planejados — decida: criar uma regra de rateio ou aceitar como despesa direta.</p>
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
          <button onClick={exportCSV} disabled={!rows.length} className="btn-secondary text-sm flex items-center gap-1.5"><Download className="w-4 h-4" /> Exportar CSV</button>
        </div>
      </div>

      {err && <div className="mb-4 flex items-center gap-2 px-4 py-2 rounded-lg text-sm bg-red-50 text-red-700"><AlertTriangle className="w-4 h-4" /> {err}</div>}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-5">
        {[
          { l: 'Despesas diretas', v: money(tot.total), c: 'text-slate-800' },
          { l: 'Fora do budget', v: money(tot.fora), c: 'text-red-600' },
          { l: 'Linhas', v: String(rows.length), c: 'text-slate-800' },
        ].map(k => (
          <div key={k.l} className="rounded-xl border border-slate-100 bg-white px-3 py-2.5">
            <div className="text-[11px] uppercase tracking-wide text-slate-400">{k.l}</div>
            <div className={`text-lg font-bold font-mono tabular-nums mt-0.5 ${k.c}`}>{k.v}</div>
          </div>
        ))}
      </div>
      <div className="text-xs text-slate-400 mb-2">{periodo} · {rows.length} combinação(ões) fornecedor × categoria</div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="tbl w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-[11px] uppercase text-slate-500">
                <th className="text-left px-3 py-2.5">Fornecedor</th>
                <th className="text-left px-3 py-2.5">Categoria</th>
                <th className="text-right px-3 py-2.5">CCs</th>
                <th className="text-right px-3 py-2.5">Lanç.</th>
                <th className="text-right px-3 py-2.5">Total</th>
                <th className="text-center px-3 py-2.5">Status</th>
                <th className="text-right px-3 py-2.5">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {!loading && rows.length === 0 && <tr><td colSpan={7} className="px-3 py-10 text-center text-slate-400">Nenhuma despesa direta no período — tudo coberto por regra. 🎉</td></tr>}
              {rows.map((r, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="px-3 py-2.5 text-slate-800">{r.supplier_name}</td>
                  <td className="px-3 py-2.5 text-slate-600">{r.category_name}</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-500">{r.ccs}</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-500">{r.lancamentos}</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-800 font-semibold">{money(r.total)}</td>
                  <td className="px-3 py-2.5 text-center">
                    {r.in_budget
                      ? <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600">No budget</span>
                      : <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-medium bg-red-50 text-red-700">Fora do budget</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <Link href="/rateio" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"><PlusCircle className="w-3.5 h-3.5" /> Criar regra</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {loading && <div className="text-sm text-slate-400 py-8 text-center">Carregando…</div>}
    </div>
  )
}
