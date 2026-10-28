'use client'
import { useEffect, useMemo, useState, Fragment } from 'react'
import dynamic from 'next/dynamic'
import { BarChart3, ChevronRight, ChevronDown, Wallet, HardDrive, KeyRound } from 'lucide-react'

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false })

interface FinRow { unidade_id: string; unidade_name: string; cost_nature: string; category_name: string; value: number }
interface AssetRow { unidade_id: string; unidade_name: string; group_name: string; count: number }
interface LicRow { unidade_id: string; unidade_name: string; group_name: string; licenses: number; seats: number; seats_used: number }
interface Data { year: number; base: string; fin: FinRow[]; assets: AssetRow[]; lics: LicRow[] }

// Naturezas (destino do custo) na ordem e cor do relatório
const NATURES = [
  { key: 'COGS', label: 'COGS', color: '#1d9e75' },
  { key: 'G&A', label: 'G&A', color: '#378add' },
  { key: 'HOLDING', label: 'Holding', color: '#7f77dd' },
  { key: 'TRANSPORTE', label: 'Transporte', color: '#ef9f27' },
]
const usd = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v || 0)

interface URow {
  id: string; name: string
  natures: Record<string, number>; finTotal: number
  cats: Record<string, Record<string, number>>   // nature -> { category -> value }
  assets: Record<string, number>; assetsTotal: number
  lics: Record<string, { licenses: number; seats: number; seats_used: number }>; licsTotal: number
}

export default function ReportInvClient({ defaultYear }: { defaultYear: number }) {
  const [year, setYear] = useState(defaultYear)
  const [base, setBase] = useState<'budget' | 'actual'>('budget')
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState<Record<string, boolean>>({})

  useEffect(() => {
    setLoading(true)
    fetch(`/api/inventory/report?year=${year}&base=${base}`)
      .then(r => r.ok ? r.json() : null).then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [year, base])

  const units = useMemo<URow[]>(() => {
    if (!data) return []
    const m = new Map<string, URow>()
    const get = (id: string, name: string): URow => {
      let r = m.get(id)
      if (!r) { r = { id, name, natures: {}, finTotal: 0, cats: {}, assets: {}, assetsTotal: 0, lics: {}, licsTotal: 0 }; m.set(id, r) }
      return r
    }
    for (const f of data.fin) {
      const r = get(f.unidade_id, f.unidade_name)
      r.natures[f.cost_nature] = (r.natures[f.cost_nature] || 0) + f.value
      r.finTotal += f.value
      r.cats[f.cost_nature] = r.cats[f.cost_nature] || {}
      r.cats[f.cost_nature][f.category_name] = (r.cats[f.cost_nature][f.category_name] || 0) + f.value
    }
    for (const a of data.assets) { const r = get(a.unidade_id, a.unidade_name); r.assets[a.group_name] = (r.assets[a.group_name] || 0) + a.count; r.assetsTotal += a.count }
    for (const l of data.lics) { const r = get(l.unidade_id, l.unidade_name); r.lics[l.group_name] = { licenses: l.licenses, seats: l.seats, seats_used: l.seats_used }; r.licsTotal += l.licenses }
    return [...m.values()].sort((a, b) => b.finTotal - a.finTotal || b.assetsTotal - a.assetsTotal || a.name.localeCompare(b.name))
  }, [data])

  // Consolidado
  const totFin = useMemo(() => {
    const t: Record<string, number> = {}; let all = 0
    for (const u of units) for (const n of NATURES) { t[n.key] = (t[n.key] || 0) + (u.natures[n.key] || 0); all += (u.natures[n.key] || 0) }
    return { t, all }
  }, [units])
  const totGroups = useMemo(() => {
    const t: Record<string, number> = {}
    for (const u of units) for (const [g, c] of Object.entries(u.assets)) t[g] = (t[g] || 0) + c
    return t
  }, [units])
  const assetsAll = useMemo(() => units.reduce((s, u) => s + u.assetsTotal, 0), [units])
  const licsAll = useMemo(() => units.reduce((s, u) => s + u.licsTotal, 0), [units])

  const natureDonut = {
    tooltip: { trigger: 'item', valueFormatter: (v: any) => usd(v) },
    legend: { bottom: 0, textStyle: { fontSize: 11 } },
    series: [{
      type: 'pie', radius: ['45%', '72%'], center: ['50%', '45%'], avoidLabelOverlap: true,
      label: { show: false }, data: NATURES.filter(n => totFin.t[n.key]).map(n => ({ name: n.label, value: Math.round(totFin.t[n.key]), itemStyle: { color: n.color } })),
    }],
  }
  const groupBar = {
    tooltip: { trigger: 'axis' },
    grid: { left: 8, right: 16, top: 16, bottom: 8, containLabel: true },
    xAxis: { type: 'value' },
    yAxis: { type: 'category', data: Object.keys(totGroups), axisLabel: { fontSize: 11 } },
    series: [{ type: 'bar', data: Object.values(totGroups), itemStyle: { color: '#378add', borderRadius: [0, 4, 4, 0] }, barWidth: 16 }],
  }

  const toggle = (id: string) => setOpen(o => ({ ...o, [id]: !o[id] }))
  const years = [defaultYear + 1, defaultYear, defaultYear - 1, defaultYear - 2]

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-navy-50 text-navy-700"><BarChart3 className="h-5 w-5" /></span>
          <div>
            <h1 className="text-xl font-semibold text-navy-800">Relatório por Unidade</h1>
            <p className="text-sm text-slate-500">Financeiro (COGS / G&amp;A / Holding) com drill-down, e inventário de TI por grupo. Valores em USD.</p>
          </div>
        </div>
        <div className="flex items-end gap-3">
          <div>
            <label className="label">Ano</label>
            <select className="input" value={year} onChange={e => setYear(parseInt(e.target.value))}>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Base</label>
            <select className="input" value={base} onChange={e => setBase(e.target.value as any)}>
              <option value="budget">Orçamento</option>
              <option value="actual">Realizado</option>
            </select>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi icon={<Wallet className="h-4 w-4" />} label="Financeiro total" value={usd(totFin.all)} />
        <Kpi icon={<span className="h-2.5 w-2.5 rounded-full" style={{ background: '#1d9e75' }} />} label="COGS" value={usd(totFin.t['COGS'] || 0)} />
        <Kpi icon={<HardDrive className="h-4 w-4" />} label="Ativos (hardware)" value={String(assetsAll)} />
        <Kpi icon={<KeyRound className="h-4 w-4" />} label="Licenças" value={String(licsAll)} />
      </div>

      {loading ? (
        <p className="mt-8 text-center text-slate-400">Carregando…</p>
      ) : !units.length ? (
        <p className="mt-8 text-center text-slate-400">Sem dados para {year} ({base === 'budget' ? 'Orçamento' : 'Realizado'}).</p>
      ) : (
        <>
          {/* Consolidado */}
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card title="Financeiro por natureza" sub="consolidado, USD">
              {totFin.all ? <ReactECharts option={natureDonut} style={{ height: 260 }} notMerge lazyUpdate /> : <Empty />}
            </Card>
            <Card title="Ativos por grupo" sub="consolidado">
              {Object.keys(totGroups).length ? <ReactECharts option={groupBar} style={{ height: 260 }} notMerge lazyUpdate /> : <Empty />}
            </Card>
          </div>

          {/* Por Unidade */}
          <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">Unidade</th>
                  <th className="px-4 py-3 text-right">Financeiro</th>
                  <th className="px-4 py-3 text-right">COGS</th>
                  <th className="px-4 py-3 text-right">G&amp;A</th>
                  <th className="px-4 py-3 text-right">Holding</th>
                  <th className="px-4 py-3 text-right">Ativos</th>
                  <th className="px-4 py-3 text-right">Licenças</th>
                </tr>
              </thead>
              <tbody>
                {units.map(u => (
                  <Fragment key={u.id}>
                    <tr className="border-b border-slate-50 hover:bg-slate-50/60 cursor-pointer" onClick={() => toggle(u.id)}>
                      <td className="px-4 py-3 font-medium text-navy-800">
                        <span className="inline-flex items-center gap-1.5">
                          {open[u.id] ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                          {u.name}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-navy-800">{usd(u.finTotal)}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{u.natures['COGS'] ? usd(u.natures['COGS']) : '—'}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{u.natures['G&A'] ? usd(u.natures['G&A']) : '—'}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{u.natures['HOLDING'] ? usd(u.natures['HOLDING']) : '—'}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{u.assetsTotal || '—'}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{u.licsTotal || '—'}</td>
                    </tr>
                    {open[u.id] && (
                      <tr key={u.id + '-d'} className="bg-slate-50/40">
                        <td colSpan={7} className="px-4 py-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            {/* Financeiro: natureza -> composição por categoria */}
                            <div>
                              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Financeiro — composição</h4>
                              {NATURES.filter(n => u.natures[n.key]).length ? NATURES.filter(n => u.natures[n.key]).map(n => (
                                <div key={n.key} className="mb-3">
                                  <div className="flex items-center justify-between text-sm">
                                    <span className="inline-flex items-center gap-1.5 font-medium text-slate-700"><span className="h-2.5 w-2.5 rounded-full" style={{ background: n.color }} />{n.label}</span>
                                    <span className="text-slate-600">{usd(u.natures[n.key])}</span>
                                  </div>
                                  <div className="mt-1 ml-4 space-y-0.5">
                                    {Object.entries(u.cats[n.key] || {}).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([cat, v]) => (
                                      <div key={cat} className="flex items-center justify-between text-xs text-slate-500">
                                        <span className="truncate pr-2">{cat}</span><span>{usd(v)}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )) : <p className="text-xs text-slate-400">Sem financeiro neste ano/base.</p>}
                            </div>
                            {/* Inventário: por grupo */}
                            <div>
                              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Inventário — por grupo</h4>
                              {u.assetsTotal ? (
                                <div className="space-y-1">
                                  {Object.entries(u.assets).sort((a, b) => b[1] - a[1]).map(([g, c]) => (
                                    <div key={g} className="flex items-center justify-between text-sm">
                                      <span className="inline-flex items-center gap-1.5 text-slate-700"><HardDrive className="h-3.5 w-3.5 text-slate-400" />{g}</span>
                                      <span className="text-slate-600">{c}</span>
                                    </div>
                                  ))}
                                </div>
                              ) : <p className="text-xs text-slate-400">Nenhum ativo cadastrado.</p>}
                              {!!u.licsTotal && (
                                <div className="mt-3 space-y-1">
                                  {Object.entries(u.lics).map(([g, s]) => (
                                    <div key={g} className="flex items-center justify-between text-sm">
                                      <span className="inline-flex items-center gap-1.5 text-slate-700"><KeyRound className="h-3.5 w-3.5 text-slate-400" />{g}</span>
                                      <span className="text-slate-600">{s.licenses} licença(s){s.seats ? ` · ${s.seats_used}/${s.seats} assentos` : ''}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-slate-400">{units.length} unidade(s) · clique numa linha para abrir a composição</p>
        </>
      )}
    </div>
  )
}

function Kpi({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white border border-slate-200 p-4">
      <div className="flex items-center gap-1.5 text-xs text-slate-500">{icon}{label}</div>
      <div className="mt-1 text-xl font-semibold text-navy-800">{value}</div>
    </div>
  )
}
function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-white border border-slate-200 p-4">
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="text-sm font-semibold text-navy-800">{title}</h3>
        {sub && <span className="text-xs text-slate-400">{sub}</span>}
      </div>
      {children}
    </div>
  )
}
function Empty() { return <p className="py-12 text-center text-sm text-slate-400">Sem dados.</p> }
