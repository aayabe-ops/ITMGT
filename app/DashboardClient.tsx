'use client'
import { useState, useEffect, useCallback, useMemo, Fragment } from 'react'
import { AuthUser } from '@/lib/auth'
import { MONTHS_PT } from '@/lib/types'
import { yearOptions, DEFAULT_YEAR } from '@/lib/years'
import { RefreshCw } from 'lucide-react'
import clsx from 'clsx'
import WelcomeOnboarding from '@/components/WelcomeOnboarding'
import dynamic from 'next/dynamic'
const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false })

const BRL = (n: number, cur = 'BRL') => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: cur, minimumFractionDigits: 0 }).format(n)
const BRLk = (n: number) => {
  const a = Math.abs(n)
  if (a >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (a >= 1e3) return `${Math.round(n / 1e3)}k`
  return String(Math.round(n))
}

// ── Bridge / Waterfall (ECharts) ──
function BridgeChart({ budget: budget0, actual: actual0, steps: steps0, factor = 1, cur = 'BRL', startLabel = 'Orçado', endLabel = 'Realizado' }: {
  budget: number; actual: number; steps: { label: string; delta: number }[]; factor?: number; cur?: string; startLabel?: string; endLabel?: string
}) {
  const budget = budget0 * factor, actual = actual0 * factor
  const steps = steps0.map(s => ({ label: s.label, delta: s.delta * factor }))
  const labels = [startLabel, ...steps.map(s => s.label), endLabel]
  const placeholder: number[] = []
  const barData: any[] = []
  let cum = budget
  placeholder.push(0); barData.push({ value: budget, itemStyle: { color: '#1C2543' } })
  for (const s of steps) {
    const from = cum, to = cum + s.delta
    placeholder.push(Math.min(from, to))
    barData.push({ value: Math.abs(s.delta), itemStyle: { color: s.delta > 0 ? '#ef4444' : '#10b981' } })
    cum = to
  }
  placeholder.push(0); barData.push({ value: actual, itemStyle: { color: '#0F4C81' } })

  const rawAt = (i: number) => i === 0 ? budget : i === labels.length - 1 ? actual : steps[i - 1].delta
  const option = {
    grid: { left: 56, right: 16, top: 24, bottom: 70 },
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'shadow' },
      formatter: (ps: any[]) => { const i = ps[0].dataIndex; const v = rawAt(i); return `${labels[i]}<br/><b>${(v >= 0 ? '' : '-') + BRL(Math.abs(v), cur)}</b>` },
    },
    xAxis: { type: 'category', data: labels, axisLabel: { interval: 0, fontSize: 10, color: '#64748b', width: 80, overflow: 'break' }, axisTick: { show: false } },
    yAxis: { type: 'value', axisLabel: { formatter: (v: number) => BRLk(v), color: '#94a3b8', fontSize: 10 }, splitLine: { lineStyle: { color: '#eef2f6' } } },
    series: [
      { name: 'ph', type: 'bar', stack: 'all', silent: true, itemStyle: { color: 'transparent' }, emphasis: { disabled: true }, data: placeholder },
      {
        name: 'Bridge', type: 'bar', stack: 'all', data: barData,
        label: { show: true, position: 'top', fontSize: 10, color: '#334155', formatter: (p: any) => { const v = rawAt(p.dataIndex); return (v > 0 && p.dataIndex > 0 && p.dataIndex < labels.length - 1 ? '+' : '') + BRLk(v) } },
      },
    ],
  }
  return <ReactECharts option={option} style={{ height: 340 }} notMerge lazyUpdate />
}

// ── Barras agrupadas: Orçado x Realizado por mês (ECharts) ──
function MonthlyChart({ data, factor = 1, cur = 'BRL' }: { data: { month: number; budget: number; actual: number }[]; factor?: number; cur?: string }) {
  const option = {
    grid: { left: 56, right: 16, top: 16, bottom: 40 },
    legend: { data: ['Orçado', 'Realizado'], bottom: 0, textStyle: { color: '#64748b', fontSize: 11 }, itemWidth: 12, itemHeight: 12 },
    tooltip: { trigger: 'axis', valueFormatter: (v: number) => BRL(v, cur) },
    xAxis: { type: 'category', data: MONTHS_PT.map(m => m.slice(0, 3)), axisLabel: { color: '#64748b', fontSize: 10 }, axisTick: { show: false } },
    yAxis: { type: 'value', axisLabel: { formatter: (v: number) => BRLk(v), color: '#94a3b8', fontSize: 10 }, splitLine: { lineStyle: { color: '#eef2f6' } } },
    series: [
      { name: 'Orçado', type: 'bar', data: data.map(d => d.budget * factor), itemStyle: { color: '#cbd5e1', borderRadius: [2, 2, 0, 0] } },
      { name: 'Realizado', type: 'bar', itemStyle: { color: '#0F4C81' }, data: data.map(d => ({ value: d.actual * factor, itemStyle: { color: d.actual === 0 ? '#e2e8f0' : d.actual <= d.budget ? '#10b981' : '#ef4444', borderRadius: [2, 2, 0, 0] } })) },
    ],
  }
  return <ReactECharts option={option} style={{ height: 300 }} notMerge lazyUpdate />
}

interface Scope { platform_id: string | null; country_id: string | null; unit_id: string | null }
interface Props {
  user: AuthUser
  units: any[]
  categories: any[]
  suppliers: any[]
  countries: any[]
  platforms: any[]
  scope: Scope
  defaultUnitId: string | null
}

export default function DashboardClient({ user, units, categories, suppliers, countries, platforms, scope, defaultUnitId }: Props) {
  // travas de escopo (não-admin): unidade > país > plataforma. Admin/sem restrição vê todas.
  const lockUnit = user.role !== 'admin' && !!scope.unit_id
  const lockCountry = user.role !== 'admin' && !scope.unit_id && !!scope.country_id
  const lockPlatform = user.role !== 'admin' && !scope.unit_id && !scope.country_id && !!scope.platform_id

  const [year, setYear] = useState(DEFAULT_YEAR)
  const [month, setMonth] = useState(0) // 0 = Ano inteiro (padrão)
  const [platformId, setPlatformId] = useState(lockPlatform ? scope.platform_id! : '')
  const [countryId, setCountryId] = useState(lockCountry ? scope.country_id! : '')
  const [unitId, setUnitId] = useState(lockUnit ? scope.unit_id! : (defaultUnitId ?? ''))
  const [unidadeId, setUnidadeId] = useState('')
  const [rows, setRows] = useState<any[]>([])
  const [prevRows, setPrevRows] = useState<any[]>([]) // budget do ano anterior (para a bridge YoY)
  const [monthly, setMonthly] = useState<any[]>([])
  const [matrix, setMatrix] = useState<any[]>([])
  const [exec, setExec] = useState<any | null>(null) // F5 — painel executivo
  const [loading, setLoading] = useState(false)
  const [ytd, setYtd] = useState(false) // F1 — acumulado até o mês selecionado
  const [cur, setCur] = useState<'LOCAL' | 'USD'>('LOCAL')

  const platByCountry = useMemo(() => new Map(countries.map((c: any) => [String(c.id), c.platform_id ? String(c.platform_id) : null])), [countries])
  const effPlatformId = lockPlatform ? scope.platform_id! : platformId

  // unidades visíveis (filtradas por escopo/plataforma e país selecionado)
  const scopedUnits = units.filter((u: any) => {
    if (lockUnit) return u.id === scope.unit_id
    if (lockCountry) return u.country_id === scope.country_id
    if (effPlatformId) return platByCountry.get(String(u.country_id)) === String(effPlatformId)
    return true
  })
  const unitOptions = scopedUnits.filter((u: any) => !countryId || u.country_id === countryId)
  const unidadeOptions = (() => {
    const m = new Map<string, string>()
    for (const u of unitOptions) if (u.unidade_id) m.set(String(u.unidade_id), u.unidade_nome)
    return [...m.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => String(a.name).localeCompare(String(b.name)))
  })()
  const countryOptions = lockCountry
    ? countries.filter((c: any) => c.id === scope.country_id)
    : countries.filter((c: any) => !effPlatformId || String(c.platform_id) === String(effPlatformId))
  const platformOptions = lockPlatform ? platforms.filter((p: any) => p.id === scope.platform_id) : platforms
  const showPlatform = user.role === 'admin' || lockPlatform

  // Moeda por país e moeda do escopo atual (null = múltiplas moedas → só faz sentido em USD)
  const curByCountry = useMemo(() => new Map(countries.map((c: any) => [String(c.id), c.currency_code || null])), [countries])
  const scopedCurrencyCode: string | null = useMemo(() => {
    if (unitId) { const u = units.find((x: any) => x.id === unitId); return u ? (curByCountry.get(String(u.country_id)) ?? null) : null }
    if (unidadeId) {
      const us = units.filter((x: any) => String(x.unidade_id) === unidadeId)
      const s = new Set(us.map((u: any) => curByCountry.get(String(u.country_id))).filter(Boolean))
      return s.size === 1 ? ([...s][0] as string) : null
    }
    if (countryId) return curByCountry.get(String(countryId)) ?? null
    const set = new Set(scopedUnits.map((u: any) => curByCountry.get(String(u.country_id))).filter(Boolean))
    return set.size === 1 ? ([...set][0] as string) : null
  }, [unitId, unidadeId, countryId, units, scopedUnits, curByCountry])

  // Sem moeda local única (escopo multi-país) → força USD. USD é sempre convertido no servidor.
  const effUsd = cur === 'USD' || !scopedCurrencyCode
  const displayCur = effUsd ? 'USD' : (scopedCurrencyCode as string)
  const factor = 1 // conversão feita no servidor (param usd)

  const load = useCallback(async () => {
    setLoading(true)
    const base = () => {
      const p = new URLSearchParams({ year: String(year) })
      if (effPlatformId) p.set('platform_id', effPlatformId)
      if (unitId) p.set('unit_id', unitId)
      if (unidadeId) p.set('unidade_id', unidadeId)
      if (countryId) p.set('country_id', countryId)
      if (effUsd) p.set('usd', '1')
      return p
    }
    const p0 = base()
    if (ytd && month >= 1) p0.set('through', String(month)); else p0.set('month', String(month))
    const res = await fetch(`/api/dashboard?${p0}`)
    const data = await res.json()
    setRows(Array.isArray(data) ? data : [])

    if (month === 0) {
      const qp = (mode: string) => { const p = base(); p.set('mode', mode); return p.toString() }
      // ano anterior (mesmo escopo/moeda) para a bridge YoY de budget
      const prevP = new URLSearchParams(base()); prevP.set('year', String(year - 1)); prevP.set('month', '0')
      const [md, mx, pv] = await Promise.all([
        fetch(`/api/dashboard?${qp('monthly')}`).then(r => r.json()).catch(() => []),
        fetch(`/api/dashboard?${qp('matrix')}`).then(r => r.json()).catch(() => []),
        fetch(`/api/dashboard?${prevP}`).then(r => r.json()).catch(() => []),
      ])
      setMonthly(Array.isArray(md) ? md : [])
      setMatrix(Array.isArray(mx) ? mx : [])
      setPrevRows(Array.isArray(pv) ? pv : [])
      // Painel executivo (F5)
      const ep = new URLSearchParams({ year: String(year) })
      if (effPlatformId) ep.set('platform_id', effPlatformId)
      if (unitId) ep.set('unit_id', unitId)
      if (unidadeId) ep.set('unidade_id', unidadeId)
      if (countryId) ep.set('country_id', countryId)
      if (effUsd) ep.set('usd', '1')
      const ex = await fetch(`/api/executive?${ep}`).then(r => r.json()).catch(() => null)
      setExec(ex && !ex.error && !ex.empty ? ex : null)
    } else {
      setMonthly([]); setMatrix([]); setPrevRows([]); setExec(null)
    }
    setLoading(false)
  }, [year, month, ytd, unitId, unidadeId, countryId, effPlatformId, effUsd])

  useEffect(() => { load() }, [load])

  const totBudget = rows.reduce((s, r) => s + Number(r.budgeted), 0)
  const totActual = rows.reduce((s, r) => s + Number(r.actual), 0)
  const totVar    = totActual - totBudget
  const totPct    = totBudget ? totVar / totBudget * 100 : 0

  // Agregado por categoria (para comparativo e bridge)
  const catAgg = useMemo(() => {
    const m = new Map<string, { budget: number; actual: number }>()
    for (const r of rows) {
      const key = String(r.category_id)
      const o = m.get(key) || { budget: 0, actual: 0 }
      o.budget += Number(r.budgeted); o.actual += Number(r.actual)
      m.set(key, o)
    }
    return [...m.entries()].map(([category_id, v]) => ({
      category_id,
      name: categories.find((c: any) => String(c.id) === category_id)?.name ?? '—',
      budget: v.budget, actual: v.actual,
      variance: v.actual - v.budget,
      pct: v.budget ? (v.actual - v.budget) / v.budget * 100 : null,
    })).sort((a, b) => b.budget - a.budget)
  }, [rows, categories])

  const isYear = month === 0

  // Bridge YoY: budget do ano anterior → budget do ano escolhido, por categoria
  const prevCatBudget = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of prevRows) { const k = String(r.category_id); m.set(k, (m.get(k) || 0) + Number(r.budgeted)) }
    return m
  }, [prevRows])
  const prevBudgetTotal = useMemo(() => [...prevCatBudget.values()].reduce((s, v) => s + v, 0), [prevCatBudget])
  const bridgeSteps = useMemo(() => {
    const ids = new Set<string>([...catAgg.map(c => c.category_id), ...prevCatBudget.keys()])
    return [...ids].map(id => {
      const cur = catAgg.find(c => c.category_id === id)?.budget || 0
      const prev = prevCatBudget.get(id) || 0
      const name = categories.find((c: any) => String(c.id) === id)?.name ?? '—'
      return { label: name, delta: cur - prev }
    }).filter(s => s.delta !== 0).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
  }, [catAgg, prevCatBudget, categories])

  // 12 meses normalizados (preenche meses faltantes com 0)
  const monthly12 = useMemo(() => {
    const m = new Map(monthly.map((r: any) => [Number(r.month), r]))
    return Array.from({ length: 12 }, (_, i) => {
      const r = m.get(i + 1)
      return { month: i + 1, budget: Number(r?.budget || 0), actual: Number(r?.actual || 0) }
    })
  }, [monthly])

  // Pivô: unidade × fornecedor × categoria × 12 meses (orçado/realizado)
  const supMap = useMemo(() => new Map(suppliers.map((s: any) => [String(s.id), s.short_name || s.name])), [suppliers])
  const catMap = useMemo(() => new Map(categories.map((c: any) => [String(c.id), c])), [categories])
  const unidadeMap = useMemo(() => new Map(units.map((u: any) => [String(u.id), u.unidade_nome || null])), [units])
  const pivot = useMemo(() => {
    const m = new Map<string, any>()
    for (const r of matrix) {
      const sid = r.supplier_id ? String(r.supplier_id) : ''
      const uName = unidadeMap.get(String(r.unit_id)) || '— sem unidade'
      const key = `${uName}|${r.category_id}|${sid}`
      let o = m.get(key)
      if (!o) {
        const cat = catMap.get(String(r.category_id))
        o = {
          unitCode: uName,
          supName: sid ? (supMap.get(sid) ?? '—') : '—',
          catCode: cat?.code ?? '—', catName: cat?.name ?? '—',
          cells: Array.from({ length: 12 }, () => ({ budget: 0, actual: 0 })),
          totB: 0, totA: 0,
        }
        m.set(key, o)
      }
      const mi = Number(r.month) - 1
      if (mi >= 0 && mi < 12) { o.cells[mi].budget += Number(r.budget); o.cells[mi].actual += Number(r.actual) }
    }
    const arr = [...m.values()]
    for (const o of arr) { o.totB = o.cells.reduce((s: number, x: any) => s + x.budget, 0); o.totA = o.cells.reduce((s: number, x: any) => s + x.actual, 0) }
    arr.sort((a, b) => String(a.unitCode).localeCompare(String(b.unitCode)) || String(a.catName).localeCompare(String(b.catName)) || String(a.supName).localeCompare(String(b.supName)))
    return arr
  }, [matrix, unidadeMap, catMap, supMap])

  const [openQ, setOpenQ] = useState<boolean[]>([false, false, false, false])
  const kfmt = (n: number) => (n === 0 ? '–' : BRLk(n * factor))
  // célula de Δ%: seta ↑ vermelho (acima) / ↓ verde (economia)
  const deltaCell = (b: number, a: number) => {
    if (!b) return <span className="text-slate-300">–</span>
    const p = (a - b) / b * 100
    if (Math.abs(p) < 0.5) return <span className="text-slate-400">0%</span>
    const up = a > b
    return <span className={clsx('inline-flex items-center gap-0.5 font-medium', up ? 'text-red-600' : 'text-emerald-600')}>{up ? '▲' : '▼'}{up ? '+' : ''}{p.toFixed(0)}%</span>
  }
  const qSum = (cells: any[], q: number, f: 'budget' | 'actual') => cells[q * 3][f] + cells[q * 3 + 1][f] + cells[q * 3 + 2][f]

  function rag(pct: number | null) {
    if (pct === null) return 'badge-gray'
    if (pct <= -5) return 'badge-green'
    if (pct >= 5)  return 'badge-red'
    return 'badge-yellow'
  }

  return (
    <div className="page-wide">
      <WelcomeOnboarding user={{ role: user.role, full_name: user.full_name, email: user.email }} />
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="text-sm text-slate-500">Orçado × Realizado — {month === 0 ? `Ano inteiro ${year}` : ytd ? `YTD até ${MONTHS_PT[month - 1]}/${year}` : `${MONTHS_PT[month - 1]}/${year}`}</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {showPlatform && (
            <select className="input w-40 text-sm" value={effPlatformId} disabled={lockPlatform}
              onChange={e => { setPlatformId(e.target.value); setCountryId(''); setUnidadeId(''); if (!lockUnit) setUnitId('') }}>
              {!lockPlatform && <option value="">Todas as plataformas</option>}
              {platformOptions.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          {(user.role === 'admin' || lockCountry) && (
            <select className="input w-40 text-sm" value={countryId} disabled={lockCountry}
              onChange={e => { setCountryId(e.target.value); setUnidadeId(''); if (!lockUnit) setUnitId('') }}>
              {!lockCountry && <option value="">Todos os países</option>}
              {countryOptions.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          {!lockUnit && (
            <select className="input w-52 text-sm" value={unidadeId} onChange={e => setUnidadeId(e.target.value)}>
              <option value="">Todas as unidades</option>
              {unidadeOptions.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          )}
          {lockUnit && (
            <span className="text-sm text-slate-600 px-2 py-1 rounded bg-slate-100">{units.find((u: any) => u.id === scope.unit_id)?.code ?? ''}</span>
          )}
          <select className="input w-32 text-sm" value={month} onChange={e => { setMonth(+e.target.value); if (+e.target.value === 0) setYtd(false) }}>
            <option value={0}>Ano inteiro</option>
            {MONTHS_PT.map((m, i) => <option key={i + 1} value={i + 1}>{m.slice(0, 3)}</option>)}
          </select>
          <button type="button" onClick={() => month >= 1 && setYtd(v => !v)} disabled={month === 0}
            title="Acumulado do ano até o mês selecionado"
            className={clsx('px-2.5 py-1.5 rounded-lg text-xs font-medium border', ytd && month >= 1 ? 'bg-blue-600 text-white border-blue-600' : month === 0 ? 'text-slate-300 border-slate-200 cursor-not-allowed' : 'text-slate-600 border-slate-200 hover:bg-slate-50')}>YTD</button>
          <select className="input w-24 text-sm" value={year} onChange={e => setYear(+e.target.value)}>
            {yearOptions().map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs">
            <button type="button" onClick={() => scopedCurrencyCode && setCur('LOCAL')} disabled={!scopedCurrencyCode}
              title={scopedCurrencyCode ? `Moeda local (${scopedCurrencyCode})` : 'Selecione um país/unidade para ver em moeda local'}
              className={clsx('px-2.5 py-1.5 font-medium', !effUsd ? 'bg-blue-600 text-white' : scopedCurrencyCode ? 'text-slate-600 hover:bg-slate-50' : 'text-slate-300 cursor-not-allowed')}>
              {scopedCurrencyCode || 'Local'}
            </button>
            <button type="button" onClick={() => setCur('USD')} title="Consolidado em dólar (US$)"
              className={clsx('px-2.5 py-1.5 font-medium border-l border-slate-200', effUsd ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50')}>USD</button>
          </div>
          <button onClick={load} className="btn-secondary" disabled={loading}>
            <RefreshCw className={clsx('w-4 h-4', loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {isYear && exec && (
        <div className="card p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-800">Painel Executivo — {year}</h2>
            <span className="text-xs text-slate-400">Forecast = Realizado até {exec.lastActualMonth >= 1 ? MONTHS_PT[exec.lastActualMonth - 1] : '—'} + Orçado restante</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Budget FY', value: BRL(Number(exec.budgetFY), displayCur), color: 'text-slate-800' },
              { label: 'Realizado YTD', value: BRL(Number(exec.actualYTD), displayCur), color: 'text-slate-800' },
              { label: 'Forecast FY', value: BRL(Number(exec.forecastFY), displayCur), color: 'text-blue-700' },
              { label: 'Forecast vs Budget', value: `${Number(exec.varianceFY) >= 0 ? '+' : ''}${BRL(Number(exec.varianceFY), displayCur)}`, color: Number(exec.varianceFY) > 0 ? 'text-red-600' : 'text-emerald-600' },
              { label: 'OPEX', value: BRL(Number(exec.opex), displayCur), color: 'text-slate-700' },
              { label: 'CAPEX', value: BRL(Number(exec.capex), displayCur), color: 'text-slate-700' },
              { label: 'Committed', value: BRL(Number(exec.committed), displayCur), color: 'text-amber-700' },
              { label: 'Available (Budget − Committed)', value: BRL(Number(exec.available), displayCur), color: Number(exec.available) < 0 ? 'text-red-600' : 'text-emerald-700' },
            ].map(k => (
              <div key={k.label} className="rounded-lg bg-slate-50 p-3">
                <p className="text-[11px] text-slate-500 uppercase tracking-wide mb-1">{k.label}</p>
                <p className={clsx('text-lg font-bold font-mono', k.color)}>{k.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Orçado',    value: BRL(totBudget * factor, displayCur), color: 'text-slate-800' },
          { label: 'Realizado', value: BRL(totActual * factor, displayCur), color: 'text-slate-800' },
          { label: 'Desvio',    value: BRL(totVar * factor, displayCur),    color: totVar > 0 ? 'text-red-600' : totVar < 0 ? 'text-emerald-600' : 'text-slate-800' },
          { label: 'Desvio %',  value: `${totPct.toFixed(1)}%`, color: totPct > 5 ? 'text-red-600' : totPct < -5 ? 'text-emerald-600' : 'text-yellow-600' },
        ].map(k => (
          <div key={k.label} className="card p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">{k.label}</p>
            <p className={clsx('text-xl font-bold font-mono', k.color)}>{k.value}</p>
          </div>
        ))}
      </div>

      {isYear && (
        <div className="space-y-4 mb-6">
          {/* Frame — Orçado x Realizado mês a mês */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-800">Orçado × Realizado — mês a mês</h2>
              <div className="flex items-center gap-4 text-xs text-slate-500">
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: '#cbd5e1' }} /> Orçado</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: '#10b981' }} /> Realizado (economia)</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: '#ef4444' }} /> Realizado (estouro)</span>
              </div>
            </div>
            <MonthlyChart data={monthly12} factor={factor} cur={displayCur} />
          </div>

          {/* Frame — Bridge Budget ano anterior → ano escolhido */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-800">Bridge — Budget {year - 1} → {year} (por categoria)</h2>
              <div className="flex items-center gap-4 text-xs text-slate-500">
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: '#ef4444' }} /> Aumento vs {year - 1}</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: '#10b981' }} /> Redução vs {year - 1}</span>
              </div>
            </div>
            <BridgeChart budget={prevBudgetTotal} actual={totBudget} steps={bridgeSteps} factor={factor} cur={displayCur} startLabel={String(year - 1)} endLabel={String(year)} />
          </div>
        </div>
      )}

      {isYear && (
        <div className="card overflow-hidden mb-6">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-slate-800">Orçado × Realizado — trimestral</h2>
            <span className="text-xs text-slate-400">Clique <b>Q1–Q4</b> p/ expandir · Δ%: <span className="text-red-600">▲ acima</span> / <span className="text-emerald-600">▼ economia</span> · valores em k</span>
          </div>
          <div className="overflow-x-auto">
            <table className="text-[11px] whitespace-nowrap">
              <thead>
                <tr className="text-white uppercase tracking-wide" style={{ backgroundColor: '#0F4C81' }}>
                  <th rowSpan={2} className="text-left px-3 py-2.5 font-semibold sticky left-0 z-10" style={{ backgroundColor: '#0F4C81' }}>Unidade</th>
                  <th rowSpan={2} className="text-left px-3 py-2.5 font-semibold">Fornecedor</th>
                  <th rowSpan={2} className="text-left px-3 py-2.5 font-semibold">Categoria</th>
                  <th rowSpan={2} className="text-left px-3 py-2.5 font-semibold">Descrição</th>
                  {[0, 1, 2, 3].map(q => (
                    <th key={q} colSpan={openQ[q] ? 12 : 3} onClick={() => setOpenQ(o => o.map((v, i) => i === q ? !v : v))}
                      className="text-center px-2 py-2.5 font-semibold border-l border-white/20 cursor-pointer hover:bg-white/10 select-none transition-colors">
                      {openQ[q] ? '▾' : '▸'} Q{q + 1}
                    </th>
                  ))}
                  <th colSpan={4} className="text-center px-2 py-2.5 font-semibold border-l-2 border-white/40">Ano {year}</th>
                </tr>
                <tr className="text-[10px] text-blue-100 uppercase" style={{ backgroundColor: '#1A5E96' }}>
                  {[0, 1, 2, 3].map(q => (
                    <Fragment key={q}>
                      {openQ[q] && [0, 1, 2].map(j => (
                        <Fragment key={j}>
                          <th className="px-1.5 py-1 text-right font-medium border-l border-white/10">{MONTHS_PT[q * 3 + j].slice(0, 3)} O</th>
                          <th className="px-1.5 py-1 text-right font-medium">R</th>
                          <th className="px-1.5 py-1 text-right font-medium">Δ%</th>
                        </Fragment>
                      ))}
                      <th className={clsx('px-1.5 py-1 text-right font-medium', !openQ[q] && 'border-l border-white/20')}>Orç</th>
                      <th className="px-1.5 py-1 text-right font-medium">Real</th>
                      <th className="px-1.5 py-1 text-right font-medium">Δ%</th>
                    </Fragment>
                  ))}
                  <th className="px-1.5 py-1 text-right font-medium border-l-2 border-white/40">Orç</th>
                  <th className="px-1.5 py-1 text-right font-medium">Real</th>
                  <th className="px-1.5 py-1 text-right font-medium">Desvio</th>
                  <th className="px-1.5 py-1 text-right font-medium">Δ%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pivot.length === 0 && (
                  <tr><td colSpan={40} className="px-4 py-10 text-center text-slate-400">{loading ? 'Carregando…' : 'Nenhum dado para o período'}</td></tr>
                )}
                {pivot.map((row: any, ri: number) => {
                  const zebra = ri % 2 === 1
                  return (
                  <tr key={ri} className={clsx('group', zebra ? 'bg-slate-50' : 'bg-white', 'hover:bg-blue-50')}>
                    <td className={clsx('px-3 py-1.5 font-mono font-medium text-slate-700 sticky left-0 z-10', zebra ? 'bg-slate-50' : 'bg-white', 'group-hover:bg-blue-50')}>{row.unitCode}</td>
                    <td className="px-3 py-1.5 text-slate-600">{row.supName}</td>
                    <td className="px-2 py-1.5 font-mono text-[10px] text-slate-400">{row.catCode}</td>
                    <td className="px-2 py-1.5 text-slate-600">{row.catName}</td>
                    {[0, 1, 2, 3].map(q => {
                      const qb = qSum(row.cells, q, 'budget'), qa = qSum(row.cells, q, 'actual')
                      return (
                        <Fragment key={q}>
                          {openQ[q] && [0, 1, 2].map(j => {
                            const c = row.cells[q * 3 + j]
                            return (
                              <Fragment key={j}>
                                <td className="px-1.5 py-1.5 text-right font-mono tabular-nums text-slate-400 border-l border-slate-100">{kfmt(c.budget)}</td>
                                <td className={clsx('px-1.5 py-1.5 text-right font-mono tabular-nums', c.actual > c.budget ? 'text-red-600' : c.actual > 0 ? 'text-emerald-600' : 'text-slate-300')}>{kfmt(c.actual)}</td>
                                <td className="px-1.5 py-1.5 text-right font-mono tabular-nums">{deltaCell(c.budget, c.actual)}</td>
                              </Fragment>
                            )
                          })}
                          <td className={clsx('px-1.5 py-1.5 text-right font-mono tabular-nums text-slate-500', !openQ[q] && 'border-l-2 border-slate-200')}>{kfmt(qb)}</td>
                          <td className="px-1.5 py-1.5 text-right font-mono tabular-nums font-medium text-slate-800">{kfmt(qa)}</td>
                          <td className="px-1.5 py-1.5 text-right font-mono tabular-nums">{deltaCell(qb, qa)}</td>
                        </Fragment>
                      )
                    })}
                    <td className="px-2 py-1.5 text-right font-mono tabular-nums font-semibold text-slate-700 border-l-2 border-slate-300">{kfmt(row.totB)}</td>
                    <td className="px-2 py-1.5 text-right font-mono tabular-nums font-semibold text-slate-900">{kfmt(row.totA)}</td>
                    <td className={clsx('px-2 py-1.5 text-right font-mono tabular-nums font-semibold', row.totA - row.totB > 0 ? 'text-red-600' : row.totA - row.totB < 0 ? 'text-emerald-600' : 'text-slate-300')}>{kfmt(row.totA - row.totB)}</td>
                    <td className="px-2 py-1.5 text-right font-mono tabular-nums">{deltaCell(row.totB, row.totA)}</td>
                  </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-100 border-t-2 border-slate-300 font-bold text-slate-800">
                  <td colSpan={4} className="px-3 py-2.5 sticky left-0 bg-slate-100 z-10 uppercase tracking-wide text-[11px]">Total</td>
                  {[0, 1, 2, 3].map(q => {
                    const qb = monthly12[q * 3].budget + monthly12[q * 3 + 1].budget + monthly12[q * 3 + 2].budget
                    const qa = monthly12[q * 3].actual + monthly12[q * 3 + 1].actual + monthly12[q * 3 + 2].actual
                    return (
                      <Fragment key={q}>
                        {openQ[q] && [0, 1, 2].map(j => (
                          <Fragment key={j}>
                            <td className="px-1.5 py-2.5 text-right font-mono tabular-nums border-l border-slate-200">{kfmt(monthly12[q * 3 + j].budget)}</td>
                            <td className="px-1.5 py-2.5 text-right font-mono tabular-nums text-slate-900">{kfmt(monthly12[q * 3 + j].actual)}</td>
                            <td className="px-1.5 py-2.5 text-right font-mono tabular-nums">{deltaCell(monthly12[q * 3 + j].budget, monthly12[q * 3 + j].actual)}</td>
                          </Fragment>
                        ))}
                        <td className={clsx('px-1.5 py-2.5 text-right font-mono tabular-nums', !openQ[q] && 'border-l-2 border-slate-200')}>{kfmt(qb)}</td>
                        <td className="px-1.5 py-2.5 text-right font-mono tabular-nums text-slate-900">{kfmt(qa)}</td>
                        <td className="px-1.5 py-2.5 text-right font-mono tabular-nums">{deltaCell(qb, qa)}</td>
                      </Fragment>
                    )
                  })}
                  <td className="px-2 py-2.5 text-right font-mono tabular-nums border-l-2 border-slate-300">{kfmt(totBudget)}</td>
                  <td className="px-2 py-2.5 text-right font-mono tabular-nums text-slate-900">{kfmt(totActual)}</td>
                  <td className={clsx('px-2 py-2.5 text-right font-mono tabular-nums', totActual - totBudget > 0 ? 'text-red-600' : totActual - totBudget < 0 ? 'text-emerald-600' : 'text-slate-300')}>{kfmt(totActual - totBudget)}</td>
                  <td className="px-2 py-2.5 text-right font-mono tabular-nums">{deltaCell(totBudget, totActual)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {!isYear && (
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="tbl w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-100">
                <th className="text-left px-4 py-3 font-medium">Unidade</th>
                <th className="text-left px-4 py-3 font-medium">Categoria</th>
                <th className="text-right px-4 py-3 font-medium">Orçado</th>
                <th className="text-right px-4 py-3 font-medium">Realizado</th>
                <th className="text-right px-4 py-3 font-medium">Desvio</th>
                <th className="text-center px-4 py-3 font-medium">%</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-400">{loading ? 'Carregando…' : 'Nenhum dado para o período'}</td></tr>
              )}
              {rows.map((r: any, i: number) => {
                const variance = Number(r.variance)
                const pct = r.variance_pct !== null ? Number(r.variance_pct) : null
                return (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-600">{units.find((u: any) => u.id === r.unit_id)?.code ?? '—'}</td>
                    <td className="px-4 py-2.5 text-slate-800">{categories.find((c: any) => c.id === r.category_id)?.name ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs text-slate-600">{BRL(Number(r.budgeted) * factor, displayCur)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs text-slate-800 font-medium">{BRL(Number(r.actual) * factor, displayCur)}</td>
                    <td className={clsx('px-4 py-2.5 text-right font-mono text-xs font-medium', variance > 0 ? 'text-red-600' : variance < 0 ? 'text-emerald-600' : 'text-slate-500')}>
                      {variance >= 0 ? '+' : ''}{BRL(variance * factor, displayCur)}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={rag(pct)}>{pct !== null ? `${pct.toFixed(1)}%` : '—'}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      )}
    </div>
  )
}
