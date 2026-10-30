'use client'

import { useState, useCallback, useMemo, useEffect } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { yearOptions, DEFAULT_YEAR } from '@/lib/years'
import { RefreshCw, Sparkles, ArrowLeft, Wallet, TrendingUp, Scale, Percent } from 'lucide-react'
import clsx from 'clsx'
import { StatHeroRow, signVariant } from '@/components/StatHero'
import dynamic from 'next/dynamic'
import Link from 'next/link'
const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false })

const PALETTE = ['#1C2543', '#0F4C81', '#2f6ca8', '#5f8fc0', '#92223E', '#c14e6c', '#3a4570', '#7dabd3', '#0f7a52', '#d98a3d', '#6b7280', '#0891b2']
const cur$ = (n: number, cur = 'USD') => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(n)
const kFmt = (n: number) => { const a = Math.abs(n); if (a >= 1e6) return `${(n / 1e6).toFixed(1)}M`; if (a >= 1e3) return `${Math.round(n / 1e3)}k`; return String(Math.round(n)) }
const pct = (a: number, b: number) => (b === 0 ? (a === 0 ? '0%' : '—') : `${(((a - b) / b) * 100).toFixed(1)}%`)

function useMonths() {
  const locale = useLocale()
  const mLoc = locale === 'pt' ? 'pt-BR' : locale
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
  const long = useMemo(() => Array.from({ length: 12 }, (_, i) => cap(new Intl.DateTimeFormat(mLoc, { month: 'long' }).format(new Date(2021, i, 1)))), [mLoc])
  const short = useMemo(() => Array.from({ length: 12 }, (_, i) => cap(new Intl.DateTimeFormat(mLoc, { month: 'short' }).format(new Date(2021, i, 1)).replace('.', '').slice(0, 3))), [mLoc])
  return { long, short }
}

function waterfallOption(startVal: number, endVal: number, steps: { name: string; delta: number }[], startLabel: string, endLabel: string, cur: string) {
  const labels = [startLabel, ...steps.map(s => s.name), endLabel]
  const placeholder: number[] = []; const barData: any[] = []
  let cum = startVal
  placeholder.push(0); barData.push({ value: startVal, itemStyle: { color: '#1C2543' } })
  for (const s of steps) { const from = cum, to = cum + s.delta; placeholder.push(Math.min(from, to)); barData.push({ value: Math.abs(s.delta), itemStyle: { color: s.delta > 0 ? '#ef4444' : '#10b981' } }); cum = to }
  placeholder.push(0); barData.push({ value: endVal, itemStyle: { color: '#0F4C81' } })
  const rawAt = (i: number) => i === 0 ? startVal : i === labels.length - 1 ? endVal : steps[i - 1].delta
  const kf = (n: number) => { const a = Math.abs(n); if (a >= 1e6) return `${(n / 1e6).toFixed(1)}M`; if (a >= 1e3) return `${Math.round(n / 1e3)}k`; return String(Math.round(n)) }
  return {
    grid: { left: 56, right: 16, top: 20, bottom: 84 },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (ps: any[]) => { const i = ps[0].dataIndex; const v = rawAt(i); return `${labels[i]}<br/><b>${(v < 0 ? '-' : '') + cur$(Math.abs(v), cur)}</b>` } },
    xAxis: { type: 'category', data: labels, axisLabel: { interval: 0, rotate: 40, fontSize: 9, color: '#64748b', width: 90, overflow: 'truncate' }, axisTick: { show: false } },
    yAxis: { type: 'value', axisLabel: { formatter: kf, color: '#94a3b8', fontSize: 10 }, splitLine: { lineStyle: { color: '#eef2f6' } } },
    series: [
      { type: 'bar', stack: 'all', silent: true, itemStyle: { color: 'transparent' }, emphasis: { disabled: true }, data: placeholder },
      { type: 'bar', stack: 'all', data: barData, label: { show: true, position: 'top', fontSize: 9, color: '#334155', formatter: (p: any) => { const v = rawAt(p.dataIndex); return (v > 0 && p.dataIndex > 0 && p.dataIndex < labels.length - 1 ? '+' : '') + kf(v) } } },
    ],
  }
}

function mergeYoY(cur: any[], prev: any[], keyField = 'id', nameField = 'name') {
  const pm = new Map(prev.map((r: any) => [String(r[keyField]), Number(r.budget || 0)]))
  const cm = new Map(cur.map((r: any) => [String(r[keyField]), { name: r[nameField], budget: Number(r.budget || 0) }]))
  const keys = new Set<string>([...cm.keys(), ...pm.keys()])
  return [...keys].map(k => {
    const c = cm.get(k); const p = pm.get(k) || 0; const curV = c?.budget || 0
    const name = c?.name ?? prev.find((r: any) => String(r[keyField]) === k)?.[nameField] ?? '—'
    const delta = curV - p
    return { key: k, name, prev: p, cur: curV, delta, pct: p !== 0 ? delta / p * 100 : null, status: p === 0 ? 'novo' : curV === 0 ? 'saiu' : '' }
  }).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
}

interface Cat { id: string; name: string; budget: number; actual: number }
interface Sup { id: string; name: string; type_name: string | null; cost_class: string | null; contract_start: string | null; contract_end: string | null; payment_due_date: string | null; budget: number }
interface UnitRow { id: string; code: string; name: string; budget: number; actual: number }
interface ReportData {
  byCategory: Cat[]; bySupplier: Sup[]; byUnit: UnitRow[];
  byCountry: { id: string; name: string; budget: number }[];
  byCostClass: { cost_class: string; budget: number }[];
  byCurrency: { currency_code: string; budget: number }[];
  bySolutionType: { solution_type: string; budget: number }[];
  byMonth: { month: number; budget: number; actual: number }[];
  prevByCategory: { id: string; name: string; budget: number }[];
  prevBySupplier: { id: string; name: string; budget: number }[];
  prevByCountry: { id: string; name: string; budget: number }[];
  prevByCostClass: { cost_class: string; budget: number }[];
  budgetByYear: { yr: number; budget: number }[];
}

const EMPTY: ReportData = { byCategory: [], bySupplier: [], byUnit: [], byCountry: [], byCostClass: [], byCurrency: [], bySolutionType: [], byMonth: [], prevByCategory: [], prevBySupplier: [], prevByCountry: [], prevByCostClass: [], budgetByYear: [] }

function Card({ title, sub, children, className }: any) {
  return (
    <div className={clsx('card p-5', className)}>
      {title && (
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
          {sub && <span className="text-xs text-slate-400">{sub}</span>}
        </div>
      )}
      {children}
    </div>
  )
}

interface Props {
  userRole: string
  countries: { id: string; code: string; name: string; currency_code: string | null }[]
  companies: { id: string; code: string; name: string; country_id: string }[]
  units: { id: string; code: string; name: string; country_id: string; company_id: string }[]
  categories: { id: string; name: string }[]
  suppliers: { id: string; name: string }[]
}

export default function ReportClient({ userRole, countries, companies, units, categories, suppliers }: Props) {
  const t = useTranslations('analise')
  const tc = useTranslations('common')
  const { long: monLong, short: monShort } = useMonths()

  const [year, setYear] = useState(DEFAULT_YEAR)
  const [month, setMonth] = useState<number | ''>('')
  const [ytd, setYtd] = useState(false)
  const [countryId, setCountryId] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [unitId, setUnitId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [costClass, setCostClass] = useState('')
  const [committed, setCommitted] = useState<{ total: number; bySupplier: any[] }>({ total: 0, bySupplier: [] })
  const [cur, setCur] = useState<'LOCAL' | 'USD'>('LOCAL')
  const [view, setView] = useState<'budget' | 'bva'>('budget')
  const [tab, setTab] = useState<'money' | 'yoy' | 'opexcapex' | 'monthly' | 'contracts'>('money')

  const [data, setData] = useState<ReportData>(EMPTY)
  const [dataError, setDataError] = useState('')
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [aiText, setAiText] = useState('')
  const [aiSavedAt, setAiSavedAt] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')

  const companyOptions = companies.filter(c => !countryId || c.country_id === countryId)
  const unitOptions = (() => {
    const m = new Map<string, string>()
    for (const u of units as any[]) if (u.unidade_id && (!countryId || u.country_id === countryId) && (!companyId || u.company_id === companyId)) m.set(String(u.unidade_id), u.unidade_nome)
    return [...m.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => String(a.name).localeCompare(String(b.name)))
  })()

  const allCurrencies = useMemo(
    () => Array.from(new Set(countries.map((c: any) => c.currency_code).filter(Boolean))),
    [countries])
  const scopedCurrencyCode = useMemo(() => {
    if (countryId) return countries.find(c => c.id === countryId)?.currency_code || null
    return allCurrencies.length === 1 ? (allCurrencies[0] as string) : null
  }, [countryId, countries, allCurrencies])
  const effUsd = cur === 'USD' || !scopedCurrencyCode
  const displayCur = effUsd ? 'USD' : (scopedCurrencyCode as string)

  const periodKind = month === '' ? 'FY' : ytd ? 'YTD' : 'MONTH'
  const hasScope = !!(countryId || companyId || unitId || categoryId || supplierId || costClass)

  const drill = useCallback((kind: string, id: string) => {
    if (kind === 'country') { setCountryId(id); setCompanyId(''); setUnitId('') }
    else if (kind === 'company') { setCompanyId(id); setUnitId('') }
    else if (kind === 'unit') setUnitId(id)
    else if (kind === 'category') setCategoryId(id)
    else if (kind === 'supplier') setSupplierId(id)
    else if (kind === 'costClass') setCostClass(id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])
  const onDrillClick = useCallback((e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest('a[data-drill]') as HTMLElement | null
    if (a) { e.preventDefault(); drill(a.dataset.kind || '', a.dataset.id || '') }
  }, [drill])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({ year: String(year) })
      if (month !== '' && ytd) qs.set('through', String(month))
      else if (month !== '') qs.set('month', String(month))
      if (countryId) qs.set('country_id', countryId)
      if (companyId) qs.set('company_id', companyId)
      if (unitId) qs.set('unidade_id', unitId)
      if (categoryId) qs.set('category_id', categoryId)
      if (supplierId) qs.set('supplier_id', supplierId)
      if (costClass) qs.set('cost_class', costClass)
      if (effUsd) qs.set('usd', '1')
      const cq = new URLSearchParams({ year: String(year) })
      if (countryId) cq.set('country_id', countryId)
      if (unitId) cq.set('unidade_id', unitId)
      if (categoryId) cq.set('category_id', categoryId)
      if (supplierId) cq.set('supplier_id', supplierId)
      if (month !== '' && ytd) cq.set('through', String(month))
      if (effUsd) cq.set('usd', '1')
      fetch(`/api/contracts/committed?${cq}`).then(r => r.json()).then(d => setCommitted({ total: d.total || 0, bySupplier: d.bySupplier || [] })).catch(() => setCommitted({ total: 0, bySupplier: [] }))
      setDataError('')
      const res = await fetch(`/api/report?${qs}`)
      const txt = await res.text()
      let d: any = null
      try { d = txt ? JSON.parse(txt) : null } catch { d = null }
      if (!d || d.error) setDataError(d?.error || `HTTP ${res.status}`)
      setData({ ...EMPTY, ...(d && !d.error && !d.empty ? d : {}) })
      setAiError('')
      const ap = new URLSearchParams({ year: String(year), period_kind: periodKind })
      if (month !== '') ap.set('month', String(month))
      if (countryId) ap.set('country_id', countryId)
      if (companyId) ap.set('company_id', companyId)
      if (unitId) ap.set('unidade_id', unitId)
      if (categoryId) ap.set('category_id', categoryId)
      if (supplierId) ap.set('supplier_id', supplierId)
      if (costClass) ap.set('cost_class', costClass)
      const sa = await fetch(`/api/report/analysis?${ap}`).then(r => r.json()).catch(() => null)
      if (sa && sa.analysis) { setAiText(sa.analysis); setAiSavedAt(sa.created_at || '') } else { setAiText(''); setAiSavedAt('') }
      setLoaded(true)
    } finally { setLoading(false) }
  }, [year, month, ytd, countryId, companyId, unitId, categoryId, supplierId, costClass, effUsd])

  useEffect(() => { load() }, [load])

  const runAI = useCallback(async () => {
    setAiLoading(true); setAiError(''); setAiText(''); setAiSavedAt('')
    try {
      const res = await fetch('/api/report/ai', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year, month: month || null, period_kind: periodKind, currency: displayCur,
          byCategory: data.byCategory, bySupplier: data.bySupplier, byCountry: data.byCountry,
          byCostClass: data.byCostClass, byCurrency: data.byCurrency, prevByCategory: data.prevByCategory,
        }),
      })
      const ct = res.headers.get('content-type') || ''
      if (!res.ok || ct.includes('application/json')) {
        const d = await res.json().catch(() => ({}))
        setAiError(d.error || `HTTP ${res.status}`)
      } else if (res.body) {
        const reader = res.body.getReader(); const dec = new TextDecoder(); let text = ''
        while (true) { const { done, value } = await reader.read(); if (done) break; text += dec.decode(value, { stream: true }); setAiText(text) }
        if (text.trim()) {
          const cr = await fetch('/api/report/analysis', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              year, month: month || null, period_kind: periodKind, currency: displayCur, analysis: text,
              country_id: countryId || null, company_id: companyId || null, unidade_id: unitId || null,
              category_id: categoryId || null, supplier_id: supplierId || null, cost_class: costClass || null,
            }),
          }).then(r => r.json()).catch(() => null)
          if (cr?.created_at) setAiSavedAt(cr.created_at)
        }
      }
    } catch (e: any) { setAiError(e.message) } finally { setAiLoading(false) }
  }, [year, month, ytd, periodKind, displayCur, data, countryId, companyId, unitId, categoryId, supplierId, costClass])

  const totBudget = data.byCategory.reduce((s, r) => s + r.budget, 0)
  const totActual = data.byCategory.reduce((s, r) => s + r.actual, 0)
  const totVar = totActual - totBudget
  const hasActual = totActual !== 0

  const categoryBar = useMemo(() => {
    const top = [...data.byCategory].sort((a, b) => b.budget - a.budget).slice(0, 14).reverse()
    return {
      grid: { left: 150, right: 44, top: 10, bottom: 20 },
      tooltip: { trigger: 'axis', valueFormatter: (v: number) => cur$(v, displayCur) },
      xAxis: { type: 'value', axisLabel: { formatter: kFmt, color: '#94a3b8', fontSize: 10 }, splitLine: { lineStyle: { color: '#eef2f6' } } },
      yAxis: { type: 'category', data: top.map(c => c.name), axisLabel: { color: '#64748b', fontSize: 11, width: 140, overflow: 'truncate' } },
      series: [{ type: 'bar', data: top.map((c, i) => ({ value: c.budget, itemStyle: { color: PALETTE[i % PALETTE.length], borderRadius: [0, 3, 3, 0] } })), label: { show: true, position: 'right', formatter: (p: any) => kFmt(p.value), fontSize: 10, color: '#475569' } }],
    }
  }, [data.byCategory, displayCur])

  const pareto = useMemo(() => {
    const top = data.bySupplier.slice(0, 15)
    const total = data.bySupplier.reduce((s, r) => s + r.budget, 0) || 1
    let cum = 0
    const cumPct = top.map(r => { cum += r.budget; return +(cum / total * 100).toFixed(1) })
    return {
      grid: { left: 56, right: 44, top: 20, bottom: 96 },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      xAxis: { type: 'category', data: top.map(r => r.name), axisLabel: { rotate: 40, fontSize: 9, color: '#64748b', width: 90, overflow: 'truncate' }, axisTick: { show: false } },
      yAxis: [
        { type: 'value', axisLabel: { formatter: kFmt, color: '#94a3b8', fontSize: 10 }, splitLine: { lineStyle: { color: '#eef2f6' } } },
        { type: 'value', max: 100, axisLabel: { formatter: '{value}%', color: '#f59e0b', fontSize: 10 }, splitLine: { show: false } },
      ],
      series: [
        { name: 'Budget', type: 'bar', data: top.map(r => r.budget), itemStyle: { color: '#0F4C81', borderRadius: [2, 2, 0, 0] } },
        { name: t('legParetoCum'), type: 'line', yAxisIndex: 1, data: cumPct, itemStyle: { color: '#f59e0b' }, lineStyle: { width: 2 }, symbolSize: 5, smooth: true },
      ],
    }
  }, [data.bySupplier])

  const donut = (rows: { name: string; value: number }[]) => ({
    tooltip: { trigger: 'item', formatter: (p: any) => `${p.name}<br/><b>${cur$(p.value, displayCur)}</b> (${p.percent}%)` },
    legend: { bottom: 0, textStyle: { color: '#64748b', fontSize: 11 }, itemWidth: 10, itemHeight: 10 },
    series: [{
      type: 'pie', radius: ['45%', '72%'], center: ['50%', '44%'], avoidLabelOverlap: true,
      itemStyle: { borderColor: '#fff', borderWidth: 2 }, label: { show: false },
      data: rows.map((r, i) => ({ name: r.name, value: r.value, itemStyle: { color: PALETTE[i % PALETTE.length] } })),
    }],
  })
  const costClassDonut = useMemo(() => donut(data.byCostClass.map(r => ({ name: r.cost_class, value: r.budget }))), [data.byCostClass, displayCur])
  const ccTotals = useMemo(() => {
    const m = new Map(data.byCostClass.map(c => [c.cost_class, c.budget]))
    const opex = m.get('OPEX') || 0, capex = m.get('CAPEX') || 0, otc = m.get('OTC') || 0
    return { opex, capex, otc, total: opex + capex + otc }
  }, [data.byCostClass])
  const currencyDonut = useMemo(() => donut(data.byCurrency.map(r => ({ name: r.currency_code, value: r.budget }))), [data.byCurrency, displayCur])

  const countryBar = useMemo(() => ({
    grid: { left: 80, right: 24, top: 12, bottom: 24 },
    tooltip: { trigger: 'axis', valueFormatter: (v: number) => cur$(v, displayCur) },
    xAxis: { type: 'value', axisLabel: { formatter: kFmt, color: '#94a3b8', fontSize: 10 }, splitLine: { lineStyle: { color: '#eef2f6' } } },
    yAxis: { type: 'category', data: data.byCountry.map(c => c.name), axisLabel: { color: '#64748b', fontSize: 11 } },
    series: [{ type: 'bar', data: data.byCountry.map((c, i) => ({ value: c.budget, itemStyle: { color: PALETTE[i % PALETTE.length], borderRadius: [0, 3, 3, 0] } })), label: { show: true, position: 'right', formatter: (p: any) => kFmt(p.value), fontSize: 10, color: '#475569' } }],
  }), [data.byCountry, displayCur])

  const solutionBar = useMemo(() => ({
    grid: { left: 140, right: 40, top: 12, bottom: 24 },
    tooltip: { trigger: 'axis', valueFormatter: (v: number) => cur$(v, displayCur) },
    xAxis: { type: 'value', axisLabel: { formatter: kFmt, color: '#94a3b8', fontSize: 10 }, splitLine: { lineStyle: { color: '#eef2f6' } } },
    yAxis: { type: 'category', data: [...data.bySolutionType].reverse().map(s => s.solution_type), axisLabel: { color: '#64748b', fontSize: 11, width: 130, overflow: 'truncate' } },
    series: [{ type: 'bar', data: [...data.bySolutionType].reverse().map((s, i) => ({ value: s.budget, itemStyle: { color: PALETTE[i % PALETTE.length], borderRadius: [0, 3, 3, 0] } })), label: { show: true, position: 'right', formatter: (p: any) => kFmt(p.value), fontSize: 10, color: '#475569' } }],
  }), [data.bySolutionType, displayCur])

  const bridge = useMemo(() => {
    const prevMap = new Map(data.prevByCategory.map(r => [r.id, r.budget]))
    const ids = new Set<string>([...data.byCategory.map(c => c.id), ...prevMap.keys()])
    const steps = [...ids].map(id => {
      const c = data.byCategory.find(x => x.id === id)?.budget || 0
      const p = prevMap.get(id) || 0
      const name = c ? data.byCategory.find(x => x.id === id)!.name : data.prevByCategory.find(x => x.id === id)?.name || '—'
      return { name, delta: c - p }
    }).filter(s => s.delta !== 0).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    const prevTotal = [...prevMap.values()].reduce((s, v) => s + v, 0)
    const labels = [String(year - 1), ...steps.map(s => s.name), String(year)]
    const placeholder: number[] = []; const barData: any[] = []
    let cumv = prevTotal
    placeholder.push(0); barData.push({ value: prevTotal, itemStyle: { color: '#1C2543' } })
    for (const s of steps) { const from = cumv, to = cumv + s.delta; placeholder.push(Math.min(from, to)); barData.push({ value: Math.abs(s.delta), itemStyle: { color: s.delta > 0 ? '#ef4444' : '#10b981' } }); cumv = to }
    placeholder.push(0); barData.push({ value: totBudget, itemStyle: { color: '#0F4C81' } })
    const rawAt = (i: number) => i === 0 ? prevTotal : i === labels.length - 1 ? totBudget : steps[i - 1].delta
    return {
      grid: { left: 56, right: 16, top: 20, bottom: 84 },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (ps: any[]) => { const i = ps[0].dataIndex; const v = rawAt(i); return `${labels[i]}<br/><b>${(v < 0 ? '-' : '') + cur$(Math.abs(v), displayCur)}</b>` } },
      xAxis: { type: 'category', data: labels, axisLabel: { interval: 0, rotate: 40, fontSize: 9, color: '#64748b', width: 90, overflow: 'truncate' }, axisTick: { show: false } },
      yAxis: { type: 'value', axisLabel: { formatter: kFmt, color: '#94a3b8', fontSize: 10 }, splitLine: { lineStyle: { color: '#eef2f6' } } },
      series: [
        { type: 'bar', stack: 'all', silent: true, itemStyle: { color: 'transparent' }, emphasis: { disabled: true }, data: placeholder },
        { type: 'bar', stack: 'all', data: barData, label: { show: true, position: 'top', fontSize: 9, color: '#334155', formatter: (p: any) => { const v = rawAt(p.dataIndex); return (v > 0 && p.dataIndex > 0 && p.dataIndex < labels.length - 1 ? '+' : '') + kFmt(v) } } },
      ],
    }
  }, [data.byCategory, data.prevByCategory, totBudget, displayCur, year])

  const prevBudgetTotal = useMemo(() => data.prevByCategory.reduce((s, r) => s + r.budget, 0), [data.prevByCategory])
  const yoyVar = totBudget - prevBudgetTotal
  const catYoY = useMemo(() => mergeYoY(data.byCategory, data.prevByCategory), [data.byCategory, data.prevByCategory])
  const supYoY = useMemo(() => mergeYoY(data.bySupplier, data.prevBySupplier), [data.bySupplier, data.prevBySupplier])
  const countryYoY = useMemo(() => mergeYoY(data.byCountry, data.prevByCountry), [data.byCountry, data.prevByCountry])
  const classYoY = useMemo(() => mergeYoY(data.byCostClass, data.prevByCostClass, 'cost_class', 'cost_class'), [data.byCostClass, data.prevByCostClass])

  const trendChart = useMemo(() => ({
    grid: { left: 56, right: 16, top: 20, bottom: 28 },
    tooltip: { trigger: 'axis', valueFormatter: (v: number) => cur$(v, displayCur) },
    xAxis: { type: 'category', data: data.budgetByYear.map(y => String(y.yr)), axisLabel: { color: '#64748b', fontSize: 11 }, axisTick: { show: false } },
    yAxis: { type: 'value', axisLabel: { formatter: kFmt, color: '#94a3b8', fontSize: 10 }, splitLine: { lineStyle: { color: '#eef2f6' } } },
    series: [{ type: 'bar', data: data.budgetByYear.map((y, i) => ({ value: y.budget, itemStyle: { color: i === data.budgetByYear.length - 1 ? '#0F4C81' : '#cbd5e1', borderRadius: [3, 3, 0, 0] } })), label: { show: true, position: 'top', formatter: (p: any) => kFmt(p.value), fontSize: 10, color: '#475569' } }],
  }), [data.budgetByYear, displayCur])

  const catGrouped = useMemo(() => {
    const top = [...catYoY].sort((a, b) => b.cur - a.cur).slice(0, 12)
    return {
      grid: { left: 56, right: 16, top: 20, bottom: 96 },
      legend: { data: [String(year - 1), String(year)], bottom: 0, textStyle: { color: '#64748b', fontSize: 11 }, itemWidth: 12, itemHeight: 12 },
      tooltip: { trigger: 'axis', valueFormatter: (v: number) => cur$(v, displayCur) },
      xAxis: { type: 'category', data: top.map(r => r.name), axisLabel: { rotate: 40, fontSize: 9, color: '#64748b', width: 90, overflow: 'truncate' }, axisTick: { show: false } },
      yAxis: { type: 'value', axisLabel: { formatter: kFmt, color: '#94a3b8', fontSize: 10 }, splitLine: { lineStyle: { color: '#eef2f6' } } },
      series: [
        { name: String(year - 1), type: 'bar', data: top.map(r => r.prev), itemStyle: { color: '#cbd5e1', borderRadius: [2, 2, 0, 0] } },
        { name: String(year), type: 'bar', data: top.map(r => r.cur), itemStyle: { color: '#0F4C81', borderRadius: [2, 2, 0, 0] } },
      ],
    }
  }, [catYoY, displayCur, year])

  const diverging = useMemo(() => {
    const top = catYoY.filter(r => r.delta !== 0).slice(0, 12).reverse()
    return {
      grid: { left: 130, right: 40, top: 12, bottom: 24 },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v: number) => `${v >= 0 ? '+' : ''}${cur$(v, displayCur)}` },
      xAxis: { type: 'value', axisLabel: { formatter: kFmt, color: '#94a3b8', fontSize: 10 }, splitLine: { lineStyle: { color: '#eef2f6' } } },
      yAxis: { type: 'category', data: top.map(r => r.name), axisLabel: { color: '#64748b', fontSize: 10, width: 120, overflow: 'truncate' } },
      series: [{ type: 'bar', data: top.map(r => ({ value: r.delta, itemStyle: { color: r.delta > 0 ? '#ef4444' : '#10b981', borderRadius: r.delta > 0 ? [0, 3, 3, 0] : [3, 0, 0, 3] } })), label: { show: true, position: 'right', formatter: (p: any) => (p.value >= 0 ? '+' : '') + kFmt(p.value), fontSize: 9, color: '#475569' } }],
    }
  }, [catYoY, displayCur])

  const novos = catYoY.filter(r => r.status === 'novo').length
  const saidos = catYoY.filter(r => r.status === 'saiu').length

  const monthly12 = useMemo(() => Array.from({ length: 12 }, (_, i) => {
    const r = data.byMonth.find(x => x.month === i + 1)
    return { month: i + 1, budget: Number(r?.budget || 0), actual: Number(r?.actual || 0) }
  }), [data.byMonth])

  const monthlyBars = useMemo(() => ({
    grid: { left: 56, right: 16, top: 16, bottom: 40 },
    legend: { data: [t('legBudget'), t('legActual')], bottom: 0, textStyle: { color: '#64748b', fontSize: 11 }, itemWidth: 12, itemHeight: 12 },
    tooltip: { trigger: 'axis', valueFormatter: (v: number) => cur$(v, displayCur) },
    xAxis: { type: 'category', data: monShort, axisLabel: { color: '#64748b', fontSize: 10 }, axisTick: { show: false } },
    yAxis: { type: 'value', axisLabel: { formatter: kFmt, color: '#94a3b8', fontSize: 10 }, splitLine: { lineStyle: { color: '#eef2f6' } } },
    series: [
      { name: t('legBudget'), type: 'bar', data: monthly12.map(d => d.budget), itemStyle: { color: '#cbd5e1', borderRadius: [2, 2, 0, 0] } },
      { name: t('legActual'), type: 'bar', itemStyle: { color: '#0F4C81' }, data: monthly12.map(d => ({ value: d.actual, itemStyle: { color: d.actual === 0 ? '#e2e8f0' : d.actual <= d.budget ? '#10b981' : '#ef4444', borderRadius: [2, 2, 0, 0] } })) },
    ],
  }), [monthly12, displayCur, monShort])

  const sCurve = useMemo(() => {
    let cb = 0, ca = 0
    const cumB = monthly12.map(d => (cb += d.budget))
    const cumA = monthly12.map(d => (ca += d.actual))
    return {
      grid: { left: 56, right: 16, top: 16, bottom: 40 },
      legend: { data: [t('legCumBudget'), t('legCumActual')], bottom: 0, textStyle: { color: '#64748b', fontSize: 11 }, itemWidth: 12, itemHeight: 12 },
      tooltip: { trigger: 'axis', valueFormatter: (v: number) => cur$(v, displayCur) },
      xAxis: { type: 'category', boundaryGap: false, data: monShort, axisLabel: { color: '#64748b', fontSize: 10 } },
      yAxis: { type: 'value', axisLabel: { formatter: kFmt, color: '#94a3b8', fontSize: 10 }, splitLine: { lineStyle: { color: '#eef2f6' } } },
      series: [
        { name: t('legCumBudget'), type: 'line', data: cumB, smooth: true, symbol: 'none', lineStyle: { color: '#94a3b8', width: 2, type: 'dashed' }, areaStyle: { color: 'rgba(148,163,184,0.08)' } },
        { name: t('legCumActual'), type: 'line', data: hasActual ? cumA : [], smooth: true, symbol: 'none', lineStyle: { color: '#0F4C81', width: 2.5 }, areaStyle: { color: 'rgba(37,99,235,0.10)' } },
      ],
    }
  }, [monthly12, displayCur, hasActual, monShort])

  function rag(a: number, b: number) {
    if (b === 0) return 'badge-gray'
    const p = (a - b) / b * 100
    if (p <= -5) return 'badge-green'; if (p >= 5) return 'badge-red'; return 'badge-yellow'
  }

  const bvaBridge = useMemo(() => {
    const steps = data.byCategory.map(c => ({ name: c.name, delta: c.actual - c.budget }))
      .filter(s => s.delta !== 0).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 14)
    return waterfallOption(totBudget, totActual, steps, t('legBudget'), t('legActual'), displayCur)
  }, [data.byCategory, totBudget, totActual, displayCur])
  const varTotal = totActual - totBudget
  const favoravel = varTotal < 0

  const linkDict = useMemo(() => {
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const items: { name: string; kind: string; id: string }[] = []
    data.byCategory.forEach(c => c.name && items.push({ name: esc(c.name), kind: 'category', id: c.id }))
    data.bySupplier.forEach(s => s.name && items.push({ name: esc(s.name), kind: 'supplier', id: s.id }))
    data.byCountry.forEach(c => c.name && items.push({ name: esc(c.name), kind: 'country', id: c.id }))
    const seen = new Set<string>()
    return items.filter(i => i.name.length >= 4 && !seen.has(i.name.toLowerCase()) && seen.add(i.name.toLowerCase()))
      .sort((a, b) => b.name.length - a.name.length).slice(0, 60)
  }, [data.byCategory, data.bySupplier, data.byCountry])

  const linkify = useCallback((line: string) => {
    let html = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    for (const it of linkDict) {
      const rx = new RegExp(`(?<![\\w>="/-])(${it.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(?![\\w])`, 'g')
      let done = false
      html = html.replace(rx, (mm) => { if (done) return mm; done = true; return `<a href="#" data-drill="1" data-kind="${it.kind}" data-id="${it.id}" class="text-blue-600 underline decoration-dotted underline-offset-2 cursor-pointer hover:text-blue-800">${mm}</a>` })
    }
    return html || '&nbsp;'
  }, [linkDict])

  const suggestions = useMemo(() => {
    const out: { kind: string; id: string; label: string }[] = []
    if (!categoryId && data.byCategory.length) { const c = [...data.byCategory].sort((a, b) => b.budget - a.budget)[0]; if (c) out.push({ kind: 'category', id: c.id, label: t('drillDetalhar', { name: c.name }) }) }
    if (!supplierId && data.bySupplier.length) { const s = [...data.bySupplier].sort((a, b) => b.budget - a.budget)[0]; if (s) out.push({ kind: 'supplier', id: s.id, label: t('drillAnalisar', { name: s.name }) }) }
    if (!unitId && data.byUnit.length > 1) { const u = [...data.byUnit].sort((a, b) => b.budget - a.budget)[0]; if (u) out.push({ kind: 'unit', id: u.id, label: t('drillAbrir', { code: u.code }) }) }
    if (!costClass && data.byCostClass.length > 1) { const cc = [...data.byCostClass].sort((a, b) => b.budget - a.budget)[0]; if (cc) out.push({ kind: 'costClass', id: cc.cost_class, label: t('drillSo', { cc: cc.cost_class }) }) }
    return out.slice(0, 4)
  }, [data.byCategory, data.bySupplier, data.byUnit, data.byCostClass, categoryId, supplierId, unitId, costClass])

  const scopeChips = useMemo(() => {
    const chips: { label: string; clear: () => void }[] = []
    if (countryId) chips.push({ label: countries.find(c => c.id === countryId)?.name || t('fbCountry'), clear: () => { setCountryId(''); setCompanyId(''); setUnitId('') } })
    if (companyId) chips.push({ label: companies.find(c => c.id === companyId)?.name || t('fbCompany'), clear: () => { setCompanyId(''); setUnitId('') } })
    if (unitId) { const u = unitOptions.find(x => x.id === unitId); chips.push({ label: u ? u.name : t('fbUnit'), clear: () => setUnitId('') }) }
    if (categoryId) chips.push({ label: categories.find(c => c.id === categoryId)?.name || t('fbCategory'), clear: () => setCategoryId('') })
    if (supplierId) chips.push({ label: suppliers.find(s => s.id === supplierId)?.name || t('fbSupplier'), clear: () => setSupplierId('') })
    if (costClass) chips.push({ label: costClass, clear: () => setCostClass('') })
    return chips
  }, [countryId, companyId, unitId, categoryId, supplierId, costClass, countries, companies, units, categories, suppliers])
  const clearScope = () => { setCountryId(''); setCompanyId(''); setUnitId(''); setCategoryId(''); setSupplierId(''); setCostClass('') }

  const years = yearOptions()
  const selCur = (v: string, set: (s: string) => void, opts: any[], ph: string, w = 'w-40', getLabel = (o: any) => o.name) => (
    <select className={clsx('input text-sm', w)} value={v} onChange={e => set(e.target.value)}>
      <option value="">{ph}</option>
      {opts.map((o: any) => <option key={o.id} value={o.id}>{getLabel(o)}</option>)}
    </select>
  )

  const period = month === '' ? t('periodFull') : ytd ? t('periodYtd', { m: monLong[Number(month) - 1] }) : monLong[Number(month) - 1]

  return (
    <div className="page-wide space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/report" className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1 mb-1"><ArrowLeft className="w-3 h-3" /> {t('back')}</Link>
          <h1 className="page-title">{t('title')}</h1>
          <p className="text-sm text-slate-500">{t('subtitle', { year: String(year), period })}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs">
            <button type="button" onClick={() => scopedCurrencyCode && setCur('LOCAL')} disabled={!scopedCurrencyCode}
              title={scopedCurrencyCode ? t('curLocalTitle', { c: scopedCurrencyCode }) : t('curLocalHint')}
              className={clsx('px-2.5 py-1.5 font-medium', !effUsd ? 'bg-blue-600 text-white' : scopedCurrencyCode ? 'text-slate-600 hover:bg-slate-50' : 'text-slate-300 cursor-not-allowed')}>{scopedCurrencyCode || t('localWord')}</button>
            <button type="button" onClick={() => setCur('USD')} title={t('curUsdTitle')}
              className={clsx('px-2.5 py-1.5 font-medium border-l border-slate-200', effUsd ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50')}>USD</button>
          </div>
          <button onClick={load} className="btn-secondary" disabled={loading}><RefreshCw className={clsx('w-4 h-4', loading && 'animate-spin')} /></button>
        </div>
      </div>

      {/* Filtros */}
      <div className="card p-3 flex flex-wrap items-center gap-2">
        {selCur(countryId, v => { setCountryId(v); setCompanyId(''); setUnitId('') }, countries, t('allCountries'), 'w-36')}
        {selCur(companyId, v => { setCompanyId(v); setUnitId('') }, companyOptions, t('allCompanies'), 'w-40')}
        {selCur(unitId, setUnitId, unitOptions, t('allUnidades'), 'w-44', (o: any) => o.name)}
        {selCur(categoryId, setCategoryId, categories, t('allCategories'), 'w-48')}
        {selCur(supplierId, setSupplierId, suppliers, t('allSuppliers'), 'w-48')}
        <select className="input w-32 text-sm" value={costClass} onChange={e => setCostClass(e.target.value)}>
          <option value="">OPEX + CAPEX</option>
          <option value="OPEX">OPEX</option>
          <option value="CAPEX">CAPEX</option>
          <option value="OTC">OTC</option>
        </select>
        <select className="input w-40 text-sm" value={month} onChange={e => { const v = e.target.value === '' ? '' : Number(e.target.value); setMonth(v); if (v === '') setYtd(false) }}>
          <option value="">{t('fullYearOpt')}</option>
          {monLong.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
        </select>
        <button type="button" onClick={() => month !== '' && setYtd(v => !v)} disabled={month === ''}
          title={t('ytdTitle')}
          className={clsx('px-2.5 py-1.5 rounded-lg text-xs font-medium border', ytd && month !== '' ? 'bg-blue-600 text-white border-blue-600' : month === '' ? 'text-slate-300 border-slate-200 cursor-not-allowed' : 'text-slate-600 border-slate-200 hover:bg-slate-50')}>YTD</button>
        <select className="input w-24 text-sm" value={year} onChange={e => setYear(Number(e.target.value))}>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* Trilha de drill (escopo atual) */}
      {scopeChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-slate-400 font-medium">{t('scopeLabel')}</span>
          {scopeChips.map((c, i) => (
            <span key={i} className="inline-flex items-center gap-1">
              {i > 0 && <span className="text-slate-300">›</span>}
              <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full pl-2.5 pr-1 py-0.5">
                {c.label}
                <button onClick={c.clear} className="hover:text-blue-900" title={t('removeLevel')}>✕</button>
              </span>
            </span>
          ))}
          <button onClick={clearScope} className="text-slate-400 hover:text-slate-600 underline ml-1">{t('clearAll')}</button>
        </div>
      )}

      {/* KPIs */}
      <StatHeroRow tiles={[
        { label: t('kBudget'), value: cur$(totBudget, displayCur), variant: 'navy', Icon: Wallet },
        { label: t('kActual'), value: hasActual ? cur$(totActual, displayCur) : '—', variant: 'teal', Icon: TrendingUp },
        { label: t('kVar'), value: hasActual ? cur$(totVar, displayCur) : '—', variant: hasActual ? signVariant(totVar > 0) : 'slate', Icon: Scale },
        { label: t('kVarPct'), value: hasActual ? pct(totActual, totBudget) : '—', variant: hasActual ? signVariant(totVar > 0) : 'slate', Icon: Percent },
      ]} />

      {dataError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          <strong>{t('dataError')}</strong> {dataError}
        </div>
      )}

      {/* Menu de topo */}
      <div className="flex gap-2">
        {([['budget', 'Budget (OPEX / CAPEX)'], ['bva', t('viewBva')]] as const).map(([v, label]) => (
          <button key={v} onClick={() => { setView(v as any); setTab(v === 'budget' ? 'money' : 'monthly') }}
            className={clsx('px-4 py-2 rounded-lg text-sm font-semibold', view === v ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>{label}</button>
        ))}
      </div>
      {/* Abas */}
      <div className="flex gap-1 border-b border-slate-200 flex-wrap">
        {(view === 'budget'
          ? [['money', t('tabMoney')], ['opexcapex', 'OPEX / CAPEX'], ['yoy', t('tabYoY', { year: String(year), prev: String(year - 1) })], ['contracts', t('tabContracts')]]
          : [['monthly', t('tabMonthly')]]).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k as any)}
            className={clsx('px-4 py-2 text-sm font-medium border-b-2 -mb-px', tab === k ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700')}>{label}</button>
        ))}
      </div>

      {loading && <div className="text-center py-16 text-slate-400 text-sm">{tc('loading')}</div>}

      {!loading && tab === 'money' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card title={t('cardCatBudget')} sub="top 14"><ReactECharts option={categoryBar} style={{ height: 320 }} notMerge lazyUpdate /></Card>
            <Card title={t('cardPareto')} sub="Top 15"><ReactECharts option={pareto} style={{ height: 320 }} notMerge lazyUpdate /></Card>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card title={t('cardByCountry')}><ReactECharts option={countryBar} style={{ height: 240 }} notMerge lazyUpdate /></Card>
            <Card title={t('cardMix')}><ReactECharts option={costClassDonut} style={{ height: 240 }} notMerge lazyUpdate /></Card>
            <Card title={t('cardByCurrency')} sub={effUsd ? t('inUsd') : displayCur}><ReactECharts option={currencyDonut} style={{ height: 240 }} notMerge lazyUpdate /></Card>
          </div>
          {data.bySolutionType.length > 0 && (
            <Card title={t('cardBySolution')}><ReactECharts option={solutionBar} style={{ height: Math.max(200, data.bySolutionType.length * 34 + 60) }} notMerge lazyUpdate /></Card>
          )}
          <Card title={t('cardBridge', { prev: String(year - 1), year: String(year) })} sub={t('bridgeLegend')}>
            {data.prevByCategory.length === 0
              ? <p className="text-sm text-slate-400 py-8 text-center">{t('noBridgePrev', { prev: String(year - 1) })}</p>
              : <ReactECharts option={bridge} style={{ height: 340 }} notMerge lazyUpdate />}
          </Card>
        </div>
      )}

      {!loading && tab === 'opexcapex' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'OPEX', value: ccTotals.opex, pctOf: ccTotals.total, color: 'text-blue-700' },
              { label: 'CAPEX', value: ccTotals.capex, pctOf: ccTotals.total, color: 'text-violet-700' },
              { label: 'OTC', value: ccTotals.otc, pctOf: ccTotals.total, color: 'text-amber-700' },
              { label: 'Total', value: ccTotals.total, pctOf: 0, color: 'text-slate-800' },
            ].map(k => (
              <div key={k.label} className="card p-4">
                <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">{k.label}</p>
                <p className={clsx('text-xl font-bold font-mono', k.color)}>{cur$(k.value, displayCur)}</p>
                {k.pctOf > 0 && <p className="text-xs text-slate-400 mt-0.5">{t('pctOfTotal', { p: (k.value / k.pctOf * 100).toFixed(1) })}</p>}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card title={t('cardDistClass')}><ReactECharts option={costClassDonut} style={{ height: 260 }} notMerge lazyUpdate /></Card>
            <Card title={t('cardDetailClass')}>
              <table className="tbl w-full text-sm">
                <thead><tr className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-100">
                  <th className="text-left px-3 py-2 font-medium">{t('colClass')}</th><th className="text-right px-3 py-2 font-medium">Budget</th><th className="text-right px-3 py-2 font-medium">%</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-50">
                  {data.byCostClass.map(c => (
                    <tr key={c.cost_class}><td className="px-3 py-2 text-slate-700">{c.cost_class}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs">{cur$(c.budget, displayCur)}</td>
                      <td className="px-3 py-2 text-right text-xs text-slate-500">{ccTotals.total > 0 ? `${(c.budget / ccTotals.total * 100).toFixed(1)}%` : '—'}</td></tr>
                  ))}
                  {data.byCostClass.length === 0 && <tr><td colSpan={3} className="px-3 py-6 text-center text-slate-400">{t('noData')}</td></tr>}
                </tbody>
              </table>
            </Card>
          </div>
          <p className="text-xs text-slate-400">{t('tipOpexCapex')}</p>
        </div>
      )}

      {!loading && tab === 'yoy' && (
        <div className="space-y-4">
          {prevBudgetTotal === 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
              {t('noPrevWarn', { prev: String(year - 1) })}
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: `Budget ${year}`, value: cur$(totBudget, displayCur), color: 'text-slate-800' },
              { label: `Budget ${year - 1}`, value: cur$(prevBudgetTotal, displayCur), color: 'text-slate-800' },
              { label: t('variation'), value: (yoyVar >= 0 ? '+' : '') + cur$(yoyVar, displayCur), color: yoyVar > 0 ? 'text-red-600' : yoyVar < 0 ? 'text-emerald-600' : 'text-slate-800' },
              { label: t('variationPct'), value: prevBudgetTotal ? (yoyVar >= 0 ? '+' : '') + (yoyVar / prevBudgetTotal * 100).toFixed(1) + '%' : '—', color: yoyVar > 0 ? 'text-red-600' : 'text-emerald-600' },
            ].map(k => (
              <div key={k.label} className="card p-4">
                <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">{k.label}</p>
                <p className={clsx('text-xl font-bold font-mono', k.color)}>{k.value}</p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card title={t('cardTrend')} sub={`${year - 3}–${year}`}><ReactECharts option={trendChart} style={{ height: 280 }} notMerge lazyUpdate /></Card>
            <Card title={t('cardDiverging')} sub={t('bridgeLegend')}><ReactECharts option={diverging} style={{ height: 280 }} notMerge lazyUpdate /></Card>
          </div>
          <Card title={t('cardCatGrouped', { prev: String(year - 1), year: String(year) })}><ReactECharts option={catGrouped} style={{ height: 320 }} notMerge lazyUpdate /></Card>
          <div className="card p-4 flex flex-wrap gap-6 text-sm">
            <div><span className="text-slate-500">{t('newCats', { year: String(year) })} </span><b className="text-blue-600">{novos}</b></div>
            <div><span className="text-slate-500">{t('discontinued')} </span><b className="text-slate-600">{saidos}</b></div>
          </div>
          <YoYTable title={t('yoyCat')} rows={catYoY} cur={displayCur} year={year} />
          <YoYTable title={t('yoySup')} rows={supYoY} cur={displayCur} year={year} />
          <YoYTable title={t('yoyCountry')} rows={countryYoY} cur={displayCur} year={year} />
          <YoYTable title={t('yoyClass')} rows={classYoY} cur={displayCur} year={year} />
        </div>
      )}

      {!loading && tab === 'monthly' && (
        <div className="space-y-4">
          {hasActual ? (
            <div className="card p-4 flex flex-wrap items-center gap-4">
              <div><p className="text-xs text-slate-500 uppercase tracking-wide mb-1">{t('totalVar')}</p>
                <p className={clsx('text-2xl font-bold font-mono', favoravel ? 'text-emerald-600' : 'text-red-600')}>{varTotal >= 0 ? '+' : ''}{cur$(varTotal, displayCur)}</p></div>
              <span className={clsx('px-3 py-1.5 rounded-full text-sm font-semibold', favoravel ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700')}>
                {favoravel ? t('favorable') : t('unfavorable')}
              </span>
              <span className="text-sm text-slate-500">{pct(totActual, totBudget)} {t('vsBudget')}</span>
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">{t('noActual')}</div>
          )}
          <Card title={t('cardBvaBridge')} sub={t('bvaBridgeLegend')}>
            {hasActual ? <ReactECharts option={bvaBridge} style={{ height: 340 }} notMerge lazyUpdate /> : <p className="text-sm text-slate-400 py-8 text-center">{t('noBridgeActual')}</p>}
          </Card>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card title={t('cardMonthlyBars')} sub={t('monthlyBarsSub')}><ReactECharts option={monthlyBars} style={{ height: 300 }} notMerge lazyUpdate /></Card>
            <Card title={t('cardSCurve')} sub={t('sCurveSub')}><ReactECharts option={sCurve} style={{ height: 300 }} notMerge lazyUpdate /></Card>
          </div>
          <RankRag title={t('offendersCat')} rows={data.byCategory.map(c => ({ id: c.id, name: c.name, budget: c.budget, actual: c.actual }))} cur={displayCur} rag={rag} hasActual={hasActual} />
          <RankRag title={t('offendersUnit')} rows={data.byUnit.map(u => ({ id: u.id, name: `${u.code} — ${u.name}`, budget: u.budget, actual: u.actual }))} cur={displayCur} rag={rag} hasActual={hasActual} />
        </div>
      )}

      {!loading && tab === 'contracts' && (
        <div className="space-y-4">
          <div className="card p-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div><p className="text-xs text-slate-500 uppercase mb-1">Budget {year}</p><p className="font-mono font-bold text-slate-800">{cur$(totBudget, displayCur)}</p></div>
            <div><p className="text-xs text-slate-500 uppercase mb-1">{t('committedContracts')}</p><p className="font-mono font-bold text-amber-700">{cur$(committed.total, displayCur)}</p></div>
            <div><p className="text-xs text-slate-500 uppercase mb-1">Available</p><p className={clsx('font-mono font-bold', totBudget - committed.total < 0 ? 'text-red-600' : 'text-emerald-700')}>{cur$(totBudget - committed.total, displayCur)}</p></div>
            <div><p className="text-xs text-slate-500 uppercase mb-1">{t('pctCommitted')}</p><p className="font-mono font-bold text-slate-800">{totBudget > 0 ? `${(committed.total / totBudget * 100).toFixed(0)}%` : '—'}</p></div>
          </div>
          <Contracts suppliers={data.bySupplier} year={year} cur={displayCur} />
        </div>
      )}

      {/* Análise com IA */}
      <div className="card p-5">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Sparkles className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-semibold text-slate-800">{t('aiTitle')}</h3>
            <span className="text-[10px] font-medium text-slate-500 bg-slate-100 rounded px-1.5 py-0.5">
              {periodKind === 'FY' ? t('fullYearOpt') : periodKind === 'YTD' ? t('periodYtd', { m: monLong[Number(month) - 1] }) : monLong[Number(month) - 1]}
            </span>
            <span className="text-xs text-slate-400">{t('aiLocal')}</span>
            {aiSavedAt && <span className="text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">{t('aiSavedAt', { d: aiSavedAt })}</span>}
          </div>
          <button onClick={runAI} disabled={aiLoading || loading} className="btn-primary text-sm">
            {aiLoading ? t('aiRunning') : aiText ? t('aiNew') : hasScope ? t('aiDeepen') : t('aiGenerate')}
          </button>
        </div>
        {suggestions.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            <span className="text-[11px] text-slate-400">{t('aiDeepenIn')}</span>
            {suggestions.map((s, i) => (
              <button key={i} onClick={() => drill(s.kind, s.id)}
                className="text-[11px] px-2 py-0.5 rounded-full border border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-700 hover:bg-blue-50">
                {s.label} <span className="text-slate-300">↳</span>
              </button>
            ))}
          </div>
        )}
        {aiLoading && !aiText && <div className="mt-3 bg-slate-50 rounded-lg p-4 text-sm text-slate-500 animate-pulse">{t('aiLoadingNote')}</div>}
        {aiError && (
          <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
            <strong>{t('errorLabel')}</strong> {aiError}
            <p className="text-xs mt-1 text-red-500">{t('aiErrorHint')}</p>
          </div>
        )}
        {aiText && (
          <div onClick={onDrillClick} className="mt-3 bg-slate-50 rounded-lg p-4 text-sm text-slate-700 leading-relaxed space-y-1">
            {aiText.split('\n').map((line, i) => (
              <p key={i} dangerouslySetInnerHTML={{ __html: linkify(line) }} />
            ))}
            {linkDict.length > 0 && <p className="text-[11px] text-slate-400 pt-1">{t('aiClickTip')}</p>}
          </div>
        )}
        {!aiText && !aiLoading && !aiError && <p className="mt-2 text-xs text-slate-400">{t('aiEmpty')}</p>}
      </div>
    </div>
  )
}

function RankRag({ title, rows, cur, rag, hasActual }: { title: string; rows: { id: string; name: string; budget: number; actual: number }[]; cur: string; rag: (a: number, b: number) => string; hasActual: boolean }) {
  const t = useTranslations('analise')
  const ranked = [...rows].map(r => ({ ...r, variance: r.actual - r.budget })).sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance)).slice(0, 15)
  const maxVar = Math.max(1, ...ranked.map(r => Math.abs(r.variance)))
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-slate-100 bg-gradient-to-r from-navy-50/70 to-transparent">
        <div className="flex items-center gap-2.5">
          <span className="w-1 h-5 rounded-full bg-bordeaux" />
          <h3 className="text-base font-semibold text-navy-800">{title}</h3>
          <span className="text-xs font-medium text-slate-500 bg-slate-100 rounded-full px-2 py-0.5">{ranked.length}</span>
        </div>
        <div className="hidden sm:flex items-center gap-3 text-[11px] text-slate-500">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> {t('legFav')}</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> {t('legUnfav')}</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="tbl w-full text-sm min-w-[640px]">
          <thead>
            <tr className="text-[11px] text-navy-700 uppercase tracking-wide bg-navy-50 border-b border-navy-100">
              <th className="text-center px-3 py-3 font-semibold w-12">#</th>
              <th className="text-left px-4 py-3 font-semibold">{t('colName')}</th>
              <th className="text-right px-4 py-3 font-semibold">{t('kBudget')}</th>
              <th className="text-right px-4 py-3 font-semibold">{t('kActual')}</th>
              <th className="text-right px-4 py-3 font-semibold">{t('kVar')}</th>
              <th className="text-center px-4 py-3 font-semibold hidden md:table-cell">%</th>
              <th className="text-center px-4 py-3 font-semibold">{t('situation')}</th>
            </tr>
          </thead>
          <tbody>
            {ranked.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">{t('noData')}</td></tr>}
            {ranked.map((r, i) => {
              const fav = r.variance < 0, bad = r.variance > 0
              return (
                <tr key={r.id} className={clsx('border-b border-slate-50 transition-colors hover:bg-navy-50/60', i % 2 === 1 && 'bg-slate-50/50')}>
                  <td className="px-3 py-2.5 text-center">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-navy-100 text-navy-700 text-[11px] font-semibold">{i + 1}</span>
                  </td>
                  <td className={clsx('px-4 py-2.5 text-slate-800 font-medium border-l-[3px]', hasActual ? (fav ? 'border-emerald-400' : bad ? 'border-red-400' : 'border-slate-200') : 'border-slate-200')}>{r.name}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs text-slate-500 whitespace-nowrap">{cur$(r.budget, cur)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs text-slate-900 whitespace-nowrap">{hasActual ? cur$(r.actual, cur) : '—'}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    {hasActual ? (
                      <div className="flex flex-col items-end gap-1">
                        <span className={clsx('font-mono text-xs font-semibold', bad ? 'text-red-600' : fav ? 'text-emerald-600' : 'text-slate-400')}>{r.variance >= 0 ? '+' : ''}{cur$(r.variance, cur)}</span>
                        <span className="block h-1.5 w-24 rounded-full bg-slate-100 overflow-hidden">
                          <span className={clsx('block h-full rounded-full', bad ? 'bg-red-400' : fav ? 'bg-emerald-400' : 'bg-slate-300')} style={{ width: `${Math.max(6, Math.abs(r.variance) / maxVar * 100)}%` }} />
                        </span>
                      </div>
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-center hidden md:table-cell">{hasActual ? <span className={rag(r.actual, r.budget)}>{pct(r.actual, r.budget)}</span> : <span className="text-slate-300">—</span>}</td>
                  <td className="px-4 py-2.5 text-center">{hasActual
                    ? <span className={clsx('inline-block text-[10px] px-2 py-0.5 rounded-full font-semibold whitespace-nowrap', fav ? 'bg-emerald-50 text-emerald-700' : bad ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-500')}>{fav ? t('favShort') : bad ? t('unfavShort') : t('neutral')}</span>
                    : <span className="text-slate-300">—</span>}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function YoYTable({ title, rows, cur, year }: { title: string; rows: any[]; cur: string; year: number }) {
  const t = useTranslations('analise')
  const top = rows.slice(0, 20)
  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100"><h3 className="text-sm font-semibold text-slate-800">{title}</h3></div>
      <div className="overflow-x-auto">
        <table className="tbl w-full text-sm">
          <thead><tr className="text-xs text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-100">
            <th className="text-left px-4 py-2.5 font-medium">{t('colName')}</th>
            <th className="text-right px-4 py-2.5 font-medium">{year - 1}</th>
            <th className="text-right px-4 py-2.5 font-medium">{year}</th>
            <th className="text-right px-4 py-2.5 font-medium">Δ</th>
            <th className="text-right px-4 py-2.5 font-medium">Δ%</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-50">
            {top.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">{t('noData')}</td></tr>}
            {top.map(r => (
              <tr key={r.key} className="hover:bg-slate-50">
                <td className="px-4 py-2.5 text-slate-700">
                  {r.name}
                  {r.status === 'novo' && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-medium">{t('badgeNew')}</span>}
                  {r.status === 'saiu' && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-medium">{t('badgeOut')}</span>}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-xs text-slate-500">{cur$(r.prev, cur)}</td>
                <td className="px-4 py-2.5 text-right font-mono text-xs text-slate-800">{cur$(r.cur, cur)}</td>
                <td className={clsx('px-4 py-2.5 text-right font-mono text-xs font-medium', r.delta > 0 ? 'text-red-600' : r.delta < 0 ? 'text-emerald-600' : 'text-slate-400')}>{r.delta >= 0 ? '+' : ''}{cur$(r.delta, cur)}</td>
                <td className={clsx('px-4 py-2.5 text-right font-mono text-xs', r.delta > 0 ? 'text-red-600' : r.delta < 0 ? 'text-emerald-600' : 'text-slate-400')}>{r.pct === null ? t('pctNew') : `${r.pct >= 0 ? '+' : ''}${r.pct.toFixed(0)}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Contracts({ suppliers, year, cur }: { suppliers: Sup[]; year: number; cur: string }) {
  const t = useTranslations('analise')
  const rows = [...suppliers].sort((a, b) => b.budget - a.budget)
  const expiring = (d: string | null) => d ? Number(d.slice(0, 4)) <= year : false
  return (
    <div className="space-y-4">
      <div className="card p-4 flex flex-wrap gap-6 text-sm">
        <div><span className="text-slate-500">{t('suppliersInScope')} </span><b className="text-slate-800">{rows.length}</b></div>
        <div><span className="text-slate-500">{t('contractsExpiring', { year: String(year) })} </span><b className="text-red-600">{rows.filter(r => expiring(r.contract_end)).length}</b></div>
        <div><span className="text-slate-500">{t('budgetTotal')} </span><b className="text-slate-800 font-mono">{cur$(rows.reduce((s, r) => s + r.budget, 0), cur)}</b></div>
      </div>
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">{t('supContractsTitle')}</h3>
          <span className="text-xs text-slate-400">{t('expiringLegend', { year: String(year) })}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="tbl w-full text-sm">
            <thead><tr className="text-xs text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-100">
              <th className="text-left px-4 py-2.5 font-medium">{t('colSupplier')}</th><th className="text-left px-4 py-2.5 font-medium">{t('colType')}</th>
              <th className="text-left px-4 py-2.5 font-medium">{t('colClass')}</th><th className="text-right px-4 py-2.5 font-medium">{t('colBudget')}</th>
              <th className="text-center px-4 py-2.5 font-medium">{t('colVigencia')}</th><th className="text-center px-4 py-2.5 font-medium">{t('colContractEnd')}</th>
              <th className="text-center px-4 py-2.5 font-medium">{t('colPayDue')}</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-50">
              {rows.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">{t('noSuppliers')}</td></tr>}
              {rows.map(r => {
                const exp = expiring(r.contract_end)
                return (
                  <tr key={r.id} className={clsx('hover:bg-slate-50', exp && 'bg-red-50/40')}>
                    <td className="px-4 py-2.5 text-slate-700">{exp && <span className="text-red-500 mr-1">●</span>}{r.name}</td>
                    <td className="px-4 py-2.5 text-slate-500 text-xs">{r.type_name || '—'}</td>
                    <td className="px-4 py-2.5 text-slate-500 text-xs">{r.cost_class || '—'}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs text-slate-700">{cur$(r.budget, cur)}</td>
                    <td className="px-4 py-2.5 text-center text-xs text-slate-500">{r.contract_start || '—'}</td>
                    <td className={clsx('px-4 py-2.5 text-center text-xs', exp ? 'text-red-600 font-semibold' : 'text-slate-500')}>{r.contract_end || '—'}</td>
                    <td className="px-4 py-2.5 text-center text-xs text-slate-500">{r.payment_due_date || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
