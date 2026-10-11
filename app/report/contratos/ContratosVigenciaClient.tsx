'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { FileSignature, Download, AlertTriangle, RefreshCw, ArrowLeft, CalendarClock } from 'lucide-react'
import { csvDownload } from '@/lib/csv'

type Contract = {
  id: string; code: string; name: string; supplier_name: string | null; unit_code: string | null
  category_name: string | null; cost_class: string | null; currency_code: string | null
  total_value: number | null; monthly_value: number | null; periodicity: string | null
  start_date: string | null; end_date: string | null; readjust_month: number | null; is_active: boolean
}
type Status = 'vencido' | 'vence30' | 'vence90' | 'vigente' | 'semdata'

const MESES = ['—', 'jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const STATUS_META: Record<Status, { label: string; cls: string; dot: string }> = {
  vencido: { label: 'Vencido', cls: 'bg-red-50 text-red-700', dot: 'bg-red-500' },
  vence30: { label: 'Vence ≤ 30 dias', cls: 'bg-orange-50 text-orange-700', dot: 'bg-orange-500' },
  vence90: { label: 'Vence ≤ 90 dias', cls: 'bg-amber-50 text-amber-700', dot: 'bg-amber-500' },
  vigente: { label: 'Vigente', cls: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' },
  semdata: { label: 'Sem vigência', cls: 'bg-slate-100 text-slate-500', dot: 'bg-slate-400' },
}
const fmtDate = (s: string | null) => s ? s.split('-').reverse().join('/') : '—'
const money = (n: number | null, cur = 'BRL') =>
  n == null ? '—' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: cur === 'USD' ? 'USD' : 'BRL' }).format(n)

function statusOf(c: Contract, today: Date): { status: Status; days: number | null } {
  if (!c.end_date) return { status: 'semdata', days: null }
  const end = new Date(c.end_date + 'T00:00:00')
  const days = Math.round((end.getTime() - today.getTime()) / 86400000)
  if (days < 0) return { status: 'vencido', days }
  if (days <= 30) return { status: 'vence30', days }
  if (days <= 90) return { status: 'vence90', days }
  return { status: 'vigente', days }
}

export default function ContratosVigenciaClient() {
  const [list, setList] = useState<Contract[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [filter, setFilter] = useState<'todos' | 'vencendo' | Status>('todos')
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }, [])

  async function load() {
    setLoading(true); setErr('')
    try {
      const r = await fetch('/api/contracts'); const d = await r.json()
      setList(Array.isArray(d) ? d : [])
    } catch (e: any) { setErr(e?.message || 'Erro ao carregar contratos.') }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const rows = useMemo(() => list.map(c => ({ ...c, ...statusOf(c, today) }))
    .sort((a, b) => {
      // vencidos e a vencer primeiro, depois por data de fim
      const rank = (s: Status) => ({ vencido: 0, vence30: 1, vence90: 2, vigente: 3, semdata: 4 }[s])
      if (rank(a.status) !== rank(b.status)) return rank(a.status) - rank(b.status)
      return (a.days ?? 1e9) - (b.days ?? 1e9)
    }), [list, today])

  const counts = useMemo(() => {
    const c = { vencido: 0, vence30: 0, vence90: 0, vigente: 0, semdata: 0 }
    rows.forEach(r => { c[r.status]++ })
    return c
  }, [rows])
  const mensalVigente = useMemo(() =>
    rows.filter(r => r.status !== 'vencido' && r.status !== 'semdata').reduce((s, r) => s + (Number(r.monthly_value) || 0), 0), [rows])

  const shown = useMemo(() => rows.filter(r =>
    filter === 'todos' ? true
      : filter === 'vencendo' ? (r.status === 'vencido' || r.status === 'vence30' || r.status === 'vence90')
        : r.status === filter), [rows, filter])

  function exportCSV() {
    const header = 'fornecedor,contrato,codigo,unidade,categoria,tratamento,inicio,fim,dias_para_vencer,status,valor_mensal,moeda,mes_reajuste'
    const esc = (s: any) => { const v = String(s ?? ''); return /[",;\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v }
    const body = shown.map(r => [
      r.supplier_name, r.name, r.code, r.unit_code, r.category_name, r.cost_class,
      r.start_date, r.end_date, r.days ?? '', STATUS_META[r.status].label,
      r.monthly_value ?? '', r.currency_code || 'BRL', r.readjust_month ? MESES[r.readjust_month] : '',
    ].map(esc).join(','))
    csvDownload(`vigencia_contratos_${new Date().toISOString().slice(0, 10)}.csv`, header, body)
  }

  const alertNum = counts.vencido + counts.vence30 + counts.vence90

  return (
    <div className="page">
      <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
        <div>
          <Link href="/report" className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1 mb-1"><ArrowLeft className="w-3 h-3" /> Relatórios</Link>
          <h1 className="page-title flex items-center gap-2"><FileSignature className="w-5 h-5 text-blue-600" /> Vigência de Contratos</h1>
          <p className="text-sm text-slate-500">O que está vigente, o que vence e quando — para renovar ou renegociar a tempo.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="btn-secondary text-sm flex items-center gap-1.5"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar</button>
          <button onClick={exportCSV} disabled={!shown.length} className="btn-secondary text-sm flex items-center gap-1.5"><Download className="w-4 h-4" /> Exportar CSV</button>
        </div>
      </div>

      {err && <div className="mb-4 flex items-center gap-2 px-4 py-2 rounded-lg text-sm bg-red-50 text-red-700"><AlertTriangle className="w-4 h-4" /> {err}</div>}

      {alertNum > 0 && (
        <div className="mb-5 flex items-start gap-3 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
          <CalendarClock className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="text-sm">
            <b>{counts.vencido + counts.vence30 + counts.vence90} contrato(s) exigem atenção</b> — {counts.vencido} vencido(s), {counts.vence30} vencem em até 30 dias, {counts.vence90} em até 90 dias.
            <button onClick={() => setFilter('vencendo')} className="underline font-medium ml-1">ver só esses</button>.
          </div>
        </div>
      )}

      {/* tiles / filtros */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-5">
        {([
          ['vencido', counts.vencido], ['vence30', counts.vence30], ['vence90', counts.vence90],
          ['vigente', counts.vigente], ['semdata', counts.semdata],
        ] as [Status, number][]).map(([s, n]) => (
          <button key={s} onClick={() => setFilter(filter === s ? 'todos' : s)}
            className={`text-left rounded-xl border px-3 py-2.5 transition-colors ${filter === s ? 'border-blue-300 ring-1 ring-blue-200' : 'border-slate-100'} bg-white`}>
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${STATUS_META[s].dot}`} />
              <span className="text-[11px] uppercase tracking-wide text-slate-400">{STATUS_META[s].label}</span>
            </div>
            <div className="text-2xl font-bold text-slate-800 tabular-nums mt-0.5">{n}</div>
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <div className="text-sm text-slate-500">
          Mostrando <b>{shown.length}</b> de {rows.length} · mensal vigente: <b className="font-mono text-slate-700">{money(mensalVigente)}</b>
          {filter !== 'todos' && <button onClick={() => setFilter('todos')} className="ml-2 text-xs text-blue-600 hover:underline">limpar filtro</button>}
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="tbl w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-[11px] uppercase text-slate-500">
                <th className="text-left px-3 py-2.5">Fornecedor / Contrato</th>
                <th className="text-left px-3 py-2.5">Unidade</th>
                <th className="text-center px-3 py-2.5">Vigência</th>
                <th className="text-right px-3 py-2.5">Dias p/ vencer</th>
                <th className="text-right px-3 py-2.5">Valor mensal</th>
                <th className="text-center px-3 py-2.5">Reajuste</th>
                <th className="text-center px-3 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {!loading && shown.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-10 text-center text-slate-400">Nenhum contrato{filter !== 'todos' ? ' neste filtro' : ''}.</td></tr>
              )}
              {shown.map(r => (
                <tr key={r.id} className="hover:bg-slate-50 align-top">
                  <td className="px-3 py-2.5">
                    <div className="text-slate-800">{r.supplier_name || '—'}</div>
                    <div className="text-xs text-slate-500">{r.name}{r.code ? ` · ${r.code}` : ''}</div>
                  </td>
                  <td className="px-3 py-2.5 text-slate-600 text-xs">{r.unit_code || '—'}</td>
                  <td className="px-3 py-2.5 text-center text-xs text-slate-600 whitespace-nowrap">{fmtDate(r.start_date)} → {fmtDate(r.end_date)}</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-xs">
                    {r.days == null ? <span className="text-slate-300">—</span>
                      : <span className={r.days < 0 ? 'text-red-600' : r.days <= 30 ? 'text-orange-600' : r.days <= 90 ? 'text-amber-600' : 'text-slate-500'}>
                        {r.days < 0 ? `${-r.days}d atrás` : `${r.days}d`}</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-700">{money(r.monthly_value, r.currency_code || 'BRL')}</td>
                  <td className="px-3 py-2.5 text-center text-xs text-slate-500">{r.readjust_month ? MESES[r.readjust_month] : '—'}</td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${STATUS_META[r.status].cls}`}>{STATUS_META[r.status].label}</span>
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
