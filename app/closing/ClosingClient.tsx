'use client'
import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react'
import { AuthUser } from '@/lib/auth'
import { MONTHS_PT } from '@/lib/types'
import { yearOptions, DEFAULT_YEAR } from '@/lib/years'
import { RefreshCw, TrendingUp, TrendingDown, Minus, Target, Wallet, Scale, X } from 'lucide-react'
import clsx from 'clsx'

const BRL = (n: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(n || 0)

interface Row {
  unit_code: string | null; unidade_code: string | null; unidade_nome: string | null
  category_name: string | null; supplier_name: string | null
  project_name: string | null; platform_name: string | null; country_name: string | null
  cost_class: string | null; budgeted: number; actual: number; variance: number; variance_pct: number | null
}

export default function ClosingClient({ user, units }: { user: AuthUser; units: any[] }) {
  const now = new Date()
  const [year, setYear] = useState(DEFAULT_YEAR)
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  // filtros client-side
  const [country, setCountry] = useState('')
  const [unidade, setUnidade] = useState('')   // agrupador (menu Unidades)
  const [unit, setUnit] = useState('')         // centro de custo (detalhe)
  const [closed, setClosed] = useState(false)
  const [closing, setClosing] = useState(false)
  const [closeMsg, setCloseMsg] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ year: String(year), month: String(month) })
    const [data, cp] = await Promise.all([
      fetch(`/api/closing?${params}`).then(r => r.json()).catch(() => []),
      fetch(`/api/closed-periods?year=${year}`).then(r => r.json()).catch(() => []),
    ])
    setRows(Array.isArray(data) ? data : [])
    setClosed(Array.isArray(cp) && cp.some((x: any) => x.month === month && (x.scenario === 'ALL' || x.scenario === 'ACTUAL')))
    setLoading(false)
  }, [year, month])
  useEffect(() => { load() }, [load])

  async function doClose(close: boolean) {
    if (close && !confirm(`Fechar ${MONTHS_PT[month - 1]}/${year}? O rateio do realizado será reprocessado e o período travado (nada recalcula até reabrir).`)) return
    setClosing(true); setCloseMsg('')
    const r = await fetch('/api/closing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ year, month, close }) })
    const d = await r.json().catch(() => ({}))
    setClosing(false)
    if (r.ok) { setCloseMsg(close ? `Mês fechado — rateio reprocessado (${d.rateio?.lines ?? 0} linha(s) distribuída(s)).` : 'Mês reaberto.'); load() }
    else setCloseMsg(d.error || 'Erro ao fechar/reabrir.')
  }

  const unitName = useMemo(() => Object.fromEntries(units.map((u: any) => [u.code, u.name])), [units])

  const countries = useMemo(
    () => Array.from(new Set(rows.map(r => r.country_name).filter(Boolean))).sort() as string[],
    [rows])
  const unidades = useMemo(
    () => Array.from(new Set(units.map((u: any) => u.unidade_nome).filter(Boolean))).sort() as string[],
    [units])
  const unitCodes = useMemo(
    () => Array.from(new Set(rows
      .filter(r => (!country || r.country_name === country) && (!unidade || r.unidade_nome === unidade))
      .map(r => r.unit_code).filter(Boolean))).sort() as string[],
    [rows, country, unidade])

  const filtered = useMemo(
    () => rows.filter(r =>
      (!country || r.country_name === country) &&
      (!unidade || r.unidade_nome === unidade) &&
      (!unit || r.unit_code === unit)),
    [rows, country, unidade, unit])

  const totB = filtered.reduce((s, r) => s + Number(r.budgeted), 0)
  const totA = filtered.reduce((s, r) => s + Number(r.actual), 0)
  const totV = totA - totB
  const totPct = totB ? totV / totB * 100 : 0
  const attain = totB ? totA / totB * 100 : 0
  const maxAbs = useMemo(() => Math.max(1, ...filtered.map(r => Math.abs(Number(r.variance) || 0))), [filtered])

  const varColor = (v: number) => v > 0 ? 'text-red-600' : v < 0 ? 'text-emerald-600' : 'text-slate-400'
  const clearFilters = () => { setCountry(''); setUnidade(''); setUnit('') }

  // ── Badge de variação (seta + %) ──
  const VarPill = ({ v, pct }: { v: number; pct: number | null }) => (
    <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
      v > 0 ? 'bg-red-50 text-red-700' : v < 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400')}>
      {v > 0 ? <TrendingUp className="w-3 h-3" /> : v < 0 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
      {pct !== null ? `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%` : '—'}
    </span>
  )

  return (
    <div className="page-wide space-y-5">
      {/* Cabeçalho + filtros */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Fechamento Mensal</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Orçado <span className="text-slate-400">×</span> Realizado por item —{' '}
            <span className="font-medium text-slate-700">{MONTHS_PT[month - 1]}/{year}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {countries.length > 1 && (
            <select className="input h-9 text-sm min-w-[9rem]" value={country}
              onChange={e => { setCountry(e.target.value); setUnidade(''); setUnit('') }}>
              <option value="">🌎 Todos os países</option>
              {countries.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          {unidades.length > 0 && (
            <select className="input h-9 text-sm min-w-[11rem]" value={unidade}
              onChange={e => { setUnidade(e.target.value); setUnit('') }}>
              <option value="">🏭 Todas as unidades</option>
              {unidades.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          )}
          <select className="input h-9 text-sm w-28" value={month} onChange={e => setMonth(+e.target.value)}>
            {MONTHS_PT.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
          </select>
          <select className="input h-9 text-sm w-24" value={year} onChange={e => setYear(+e.target.value)}>
            {yearOptions().map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={load} className="btn-secondary h-9 px-2.5" title="Atualizar" disabled={loading}>
            <RefreshCw className={clsx('w-4 h-4', loading && 'animate-spin')} />
          </button>
          {closed
            ? <button onClick={() => doClose(false)} disabled={closing} className="btn-secondary h-9 text-red-600 whitespace-nowrap">{closing ? '…' : '🔓 Reabrir mês'}</button>
            : <button onClick={() => doClose(true)} disabled={closing} className="btn-primary h-9 whitespace-nowrap">{closing ? 'Fechando…' : '🔒 Fechar mês'}</button>}
        </div>
      </div>

      {closed && (
        <div className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm bg-slate-100 text-slate-600 -mt-1">
          🔒 <b>{MONTHS_PT[month - 1]}/{year}</b> fechado — o rateio do realizado está travado (não recalcula até reabrir).
        </div>
      )}
      {closeMsg && (
        <div className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm bg-blue-50 text-blue-700 -mt-1">{closeMsg}</div>
      )}

      {/* Chips de filtro ativo */}
      {(country || unidade || unit) && (
        <div className="flex flex-wrap items-center gap-2 -mt-1">
          <span className="text-xs text-slate-400">Filtros:</span>
          {country && (
            <button onClick={() => { setCountry(''); setUnidade(''); setUnit('') }}
              className="inline-flex items-center gap-1 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs px-2.5 py-1">
              {country} <X className="w-3 h-3" />
            </button>
          )}
          {unidade && (
            <button onClick={() => { setUnidade(''); setUnit('') }}
              className="inline-flex items-center gap-1 rounded-full bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs px-2.5 py-1">
              🏭 {unidade} <X className="w-3 h-3" />
            </button>
          )}
          {unit && (
            <button onClick={() => setUnit('')}
              className="inline-flex items-center gap-1 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs px-2.5 py-1">
              CC {unit}{unitName[unit] ? ` — ${unitName[unit]}` : ''} <X className="w-3 h-3" />
            </button>
          )}
          <button onClick={clearFilters} className="text-xs text-blue-600 hover:underline">limpar</button>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <KPI icon={<Target className="w-4 h-4" />} label="Orçado" value={BRL(totB)} tone="slate" />
        <KPI icon={<Wallet className="w-4 h-4" />} label="Realizado" value={BRL(totA)} tone="navy"
          footer={
            <div className="mt-2">
              <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                <span>Atingimento</span><span className="font-semibold text-slate-600">{attain.toFixed(0)}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full rounded-full transition-all"
                  style={{ width: `${Math.min(attain, 100)}%`, background: attain > 100 ? '#ef4444' : '#10b981' }} />
              </div>
            </div>
          } />
        <KPI icon={<Scale className="w-4 h-4" />} label="Desvio (R$)" value={`${totV > 0 ? '+' : ''}${BRL(totV)}`}
          tone={totV > 0 ? 'red' : totV < 0 ? 'green' : 'slate'} />
        <KPI icon={totV > 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
          label="Desvio (%)" value={`${totPct > 0 ? '+' : ''}${totPct.toFixed(1)}%`}
          tone={totV > 0 ? 'red' : totV < 0 ? 'green' : 'slate'} />
      </div>

      {/* Tabela */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-800">Detalhamento por item
            <span className="ml-2 text-xs font-normal text-slate-400">{filtered.length} {filtered.length === 1 ? 'linha' : 'linhas'}</span>
          </h2>
          <div className="hidden sm:flex items-center gap-3 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Favorável (economia)</span>
            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> Acima do orçado</span>
          </div>
        </div>

        <div className="overflow-auto max-h-[64vh]">
          <table className="min-w-full text-sm border-separate border-spacing-0">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-white/90" style={{ backgroundColor: '#0F4C81' }}>
                <th className="sticky top-0 z-10 text-left font-semibold px-4 py-3" style={{ backgroundColor: '#0F4C81' }}>Unidade</th>
                <th className="sticky top-0 z-10 text-left font-semibold px-3 py-3" style={{ backgroundColor: '#0F4C81' }}>Categoria</th>
                <th className="sticky top-0 z-10 text-left font-semibold px-3 py-3" style={{ backgroundColor: '#0F4C81' }}>Fornecedor</th>
                <th className="sticky top-0 z-10 text-left font-semibold px-3 py-3 hidden xl:table-cell" style={{ backgroundColor: '#0F4C81' }}>Projeto</th>
                <th className="sticky top-0 z-10 text-right font-semibold px-3 py-3" style={{ backgroundColor: '#0F4C81' }}>Orçado</th>
                <th className="sticky top-0 z-10 text-right font-semibold px-3 py-3" style={{ backgroundColor: '#0F4C81' }}>Realizado</th>
                <th className="sticky top-0 z-10 text-right font-semibold px-4 py-3 min-w-[9.5rem]" style={{ backgroundColor: '#0F4C81' }}>Desvio</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-400">
                  {loading ? 'Carregando…' : 'Nenhum item para o período/filtro selecionado.'}
                </td></tr>
              )}
              {filtered.map((r, i) => {
                const v = Number(r.variance)
                const pct = r.variance_pct !== null ? Number(r.variance_pct) : null
                const barW = Math.min(100, Math.abs(v) / maxAbs * 100)
                return (
                  <tr key={i} className={clsx('border-b border-slate-50 hover:bg-blue-50/40 transition-colors',
                    i % 2 ? 'bg-slate-50/40' : 'bg-white')}>
                    <td className="px-4 py-2.5 align-top">
                      <div className="font-semibold text-slate-800 text-[13px] leading-tight">{r.unidade_nome ?? <span className="text-slate-400 font-normal">— sem unidade</span>}</div>
                      <div className="text-[11px] text-slate-400 leading-tight">{[r.unit_code, r.country_name].filter(Boolean).join(' · ') || '—'}</div>
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-700 text-[13px]">{r.category_name ?? '—'}</span>
                        {r.cost_class && (
                          <span className={clsx('text-[9px] font-bold px-1.5 py-0.5 rounded',
                            r.cost_class === 'CAPEX' ? 'bg-violet-50 text-violet-600' :
                            r.cost_class === 'OPEX' ? 'bg-sky-50 text-sky-600' : 'bg-slate-100 text-slate-500')}>
                            {r.cost_class}
                          </span>
                        )}
                      </div>
                      {r.platform_name && <div className="text-[10px] text-slate-400 xl:hidden">{r.platform_name}</div>}
                    </td>
                    <td className="px-3 py-2.5 align-top text-slate-600 text-[13px] max-w-[14rem] truncate" title={r.supplier_name ?? ''}>
                      {r.supplier_name ?? '—'}
                    </td>
                    <td className="px-3 py-2.5 align-top text-slate-400 text-xs hidden xl:table-cell">{r.project_name ?? '—'}</td>
                    <td className="px-3 py-2.5 align-top text-right font-mono text-[13px] text-slate-500 tabular-nums whitespace-nowrap">{BRL(Number(r.budgeted))}</td>
                    <td className="px-3 py-2.5 align-top text-right font-mono text-[13px] text-slate-900 font-semibold tabular-nums whitespace-nowrap">{BRL(Number(r.actual))}</td>
                    <td className="px-4 py-2.5 align-top">
                      <div className="flex flex-col items-end gap-1">
                        <div className="flex items-center gap-2">
                          <span className={clsx('font-mono text-[13px] font-semibold tabular-nums whitespace-nowrap', varColor(v))}>
                            {v > 0 ? '+' : ''}{BRL(v)}
                          </span>
                          <VarPill v={v} pct={pct} />
                        </div>
                        <div className="h-1 w-full rounded-full bg-slate-100 overflow-hidden">
                          <div className="h-full rounded-full ml-auto"
                            style={{ width: `${barW}%`, background: v > 0 ? '#ef4444' : v < 0 ? '#10b981' : '#cbd5e1' }} />
                        </div>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr className="sticky bottom-0 bg-slate-100 border-t-2 border-slate-300 font-bold text-slate-800">
                  <td colSpan={4} className="px-4 py-3 text-xs uppercase tracking-wide hidden xl:table-cell">Total ({filtered.length} itens)</td>
                  <td colSpan={3} className="px-4 py-3 text-xs uppercase tracking-wide xl:hidden">Total</td>
                  <td className="px-3 py-3 text-right font-mono text-[13px] tabular-nums">{BRL(totB)}</td>
                  <td className="px-3 py-3 text-right font-mono text-[13px] tabular-nums">{BRL(totA)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <span className={clsx('font-mono text-[13px] font-bold tabular-nums', varColor(totV))}>
                        {totV > 0 ? '+' : ''}{BRL(totV)}
                      </span>
                      <VarPill v={totV} pct={totB ? totPct : null} />
                    </div>
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  )
}

// ── KPI card ──
function KPI({ icon, label, value, tone, footer }: {
  icon: ReactNode; label: string; value: string
  tone: 'slate' | 'navy' | 'red' | 'green'; footer?: ReactNode
}) {
  const tones: Record<string, string> = {
    slate: 'text-slate-400 bg-slate-50',
    navy: 'text-[#0F4C81] bg-blue-50',
    red: 'text-red-500 bg-red-50',
    green: 'text-emerald-500 bg-emerald-50',
  }
  const valTone: Record<string, string> = {
    slate: 'text-slate-800', navy: 'text-slate-900', red: 'text-red-600', green: 'text-emerald-600',
  }
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span className={clsx('inline-flex items-center justify-center w-7 h-7 rounded-lg', tones[tone])}>{icon}</span>
        <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</span>
      </div>
      <p className={clsx('mt-2 text-xl md:text-2xl font-bold font-mono tabular-nums', valTone[tone])}>{value}</p>
      {footer}
    </div>
  )
}
