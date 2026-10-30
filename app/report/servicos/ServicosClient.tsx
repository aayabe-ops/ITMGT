'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { ArrowLeft, RefreshCw, Download, Search, Layers, FileSignature, Wallet, TrendingUp, Scale } from 'lucide-react'
import clsx from 'clsx'
import { yearOptions, DEFAULT_YEAR } from '@/lib/years'
import { csvDownload } from '@/lib/csv'
import { StatHeroRow, signVariant } from '@/components/StatHero'

type Opt = { id: string; name: string }
type Row = {
  unit_id: string; unit_code: string; unidade_id: string | null; unidade_nome: string | null
  supplier_id: string | null; supplier_name: string | null
  category_id: string | null; category_name: string | null
  service_id: string | null; servico_nome: string | null
  contratado: number; orcado: number; realizado: number; rateado: boolean
}

export default function ServicosClient({ countries, unidades }: { countries: Opt[]; unidades: Opt[] }) {
  const t = useTranslations('rep')
  const tc = useTranslations('common')
  const [year, setYear] = useState(DEFAULT_YEAR)
  const [cur, setCur] = useState<'LOCAL' | 'USD'>('LOCAL')
  const [countryId, setCountryId] = useState('')
  const [unidadeId, setUnidadeId] = useState('')
  const [q, setQ] = useState('')
  const [group, setGroup] = useState(true)
  const [rows, setRows] = useState<Row[]>([])
  const [currency, setCurrency] = useState('BRL')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  const money = useCallback((n: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n || 0), [currency])

  const load = useCallback(async () => {
    setLoading(true); setErr('')
    try {
      const p = new URLSearchParams({ year: String(year) })
      if (cur === 'USD') p.set('usd', '1')
      if (countryId) p.set('country_id', countryId)
      if (unidadeId) p.set('unidade_id', unidadeId)
      const d = await fetch(`/api/report/servicos?${p}`).then(r => r.json())
      if (d.error) { setErr(d.error); setRows([]) }
      else { setRows(Array.isArray(d.rows) ? d.rows : []); setCurrency(d.currency || 'BRL') }
    } catch (e: any) { setErr(e?.message || t('loadError')) }
    setLoading(false)
  }, [year, cur, countryId, unidadeId])
  useEffect(() => { load() }, [load])

  const shown = useMemo(() => {
    const base = group
      ? Object.values(rows.reduce((acc: Record<string, Row>, r) => {
          const k = r.service_id || `${r.supplier_id || ''}|${r.category_id || ''}`
          const a = acc[k] || { ...r, unit_id: '', unit_code: '', unidade_id: null, unidade_nome: null, contratado: 0, orcado: 0, realizado: 0 }
          a.contratado += r.contratado; a.orcado += r.orcado; a.realizado += r.realizado; a.rateado = a.rateado || r.rateado
          acc[k] = a; return acc
        }, {}))
      : rows
    const nq = q.trim().toLowerCase()
    const filtered = nq
      ? base.filter(r => [r.supplier_name, r.category_name, r.servico_nome, r.unidade_nome, r.unit_code].some(v => String(v || '').toLowerCase().includes(nq)))
      : base
    return filtered.sort((a, b) => b.realizado - a.realizado || b.orcado - a.orcado)
  }, [rows, group, q])

  const tot = useMemo(() => shown.reduce((s, r) => ({
    contratado: s.contratado + r.contratado, orcado: s.orcado + r.orcado, realizado: s.realizado + r.realizado,
  }), { contratado: 0, orcado: 0, realizado: 0 }), [shown])

  function exportCsv() {
    const header = (group
      ? ['fornecedor', 'servico', 'categoria', 'modo', 'contratado', 'orcado', 'realizado', 'real_menos_orc']
      : ['fornecedor', 'servico', 'categoria', 'unidade', 'modo', 'contratado', 'orcado', 'realizado', 'real_menos_orc']).join(',')
    const esc = (s: any) => { const v = String(s ?? ''); return /[",;\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v }
    const data = shown.map(r => {
      const cols = group
        ? [r.supplier_name, r.servico_nome, r.category_name, r.rateado ? 'RATEIO' : 'DIRETO', r.contratado, r.orcado, r.realizado, r.realizado - r.orcado]
        : [r.supplier_name, r.servico_nome, r.category_name, r.unidade_nome || r.unit_code, r.rateado ? 'RATEIO' : 'DIRETO', r.contratado, r.orcado, r.realizado, r.realizado - r.orcado]
      return cols.map(esc).join(',')
    })
    csvDownload(`correlacao_servicos_${year}.csv`, header, data)
  }

  const years = yearOptions()
  const varCls = (real: number, orc: number) => real > orc * 1.001 ? 'text-red-600' : real < orc * 0.999 ? 'text-emerald-600' : 'text-slate-500'
  const initials = (s: string | null) => (s || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?'

  return (
    <div className="page-wide space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/report" className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1 mb-1"><ArrowLeft className="w-3 h-3" /> {t('back')}</Link>
          <h1 className="page-title flex items-center gap-2"><FileSignature className="w-5 h-5 text-blue-600" /> {t('servicos.title')}</h1>
          <p className="text-sm text-slate-500">{group ? t('servicos.subtitleGroup', { year: String(year) }) : t('servicos.subtitleUnit', { year: String(year) })}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs">
            {(['LOCAL', 'USD'] as const).map(c => (
              <button key={c} onClick={() => setCur(c)} className={clsx('px-2.5 py-1.5 font-medium', cur === c ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50', c === 'USD' && 'border-l border-slate-200')}>{c === 'LOCAL' ? t('localWord') : 'USD'}</button>
            ))}
          </div>
          <button onClick={load} className="btn-secondary" disabled={loading}><RefreshCw className={clsx('w-4 h-4', loading && 'animate-spin')} /></button>
        </div>
      </div>

      {/* Filtros */}
      <div className="card p-3 flex flex-wrap items-center gap-2">
        <select className="input w-40 text-sm" value={countryId} onChange={e => setCountryId(e.target.value)}>
          <option value="">{t('allCountries')}</option>
          {countries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="input w-48 text-sm" value={unidadeId} onChange={e => setUnidadeId(e.target.value)}>
          <option value="">{t('allUnidades')}</option>
          {unidades.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <div className="relative w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input className="input pl-9 text-sm" placeholder={t('servicos.searchPh')} value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <select className="input w-24 text-sm" value={year} onChange={e => setYear(Number(e.target.value))}>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <button type="button" onClick={() => setGroup(g => !g)}
          className={clsx('px-2.5 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1', group ? 'bg-blue-600 text-white border-blue-600' : 'text-slate-600 border-slate-200 hover:bg-slate-50')}>
          <Layers className="w-3.5 h-3.5" /> {group ? t('servicos.byService') : t('servicos.byUnit')}
        </button>
        <button onClick={exportCsv} className="btn-secondary text-sm flex items-center gap-1.5 ml-auto"><Download className="w-4 h-4" /> {t('csv')}</button>
      </div>

      {/* KPIs */}
      <StatHeroRow tiles={[
        { label: t('servicos.statContratado'), value: money(tot.contratado), variant: 'navy', Icon: FileSignature },
        { label: t('orcado'), value: money(tot.orcado), variant: 'blue', Icon: Wallet },
        { label: t('realizado'), value: money(tot.realizado), variant: 'teal', Icon: TrendingUp, sub: tot.orcado ? t('servicos.subOrcPct', { p: (tot.realizado / tot.orcado * 100).toFixed(0) }) : '' },
        { label: t('servicos.statRealOrc'), value: (tot.realizado - tot.orcado >= 0 ? '+' : '') + money(tot.realizado - tot.orcado), variant: signVariant(tot.realizado > tot.orcado), Icon: Scale, sub: tot.orcado ? t('servicos.subVsOrc', { p: ((tot.realizado - tot.orcado) / tot.orcado * 100).toFixed(1) }) : '' },
      ]} />

      {err && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700"><strong>{t('servicos.errorPrefix')}</strong> {err}</div>}

      <div className="card overflow-hidden rounded-2xl shadow-sm">
        <div className="overflow-x-auto">
          <table className="tbl w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-100">
                <th className="text-left px-4 py-3 font-medium">{t('servicos.colSupplier')}</th>
                <th className="text-left px-4 py-3 font-medium">{t('servicos.colServiceCat')}</th>
                {!group && <th className="text-left px-4 py-3 font-medium">{t('unidade')}</th>}
                <th className="text-center px-4 py-3 font-medium">{t('servicos.colMode')}</th>
                <th className="text-right px-4 py-3 font-medium">{t('servicos.colContratado')}</th>
                <th className="text-right px-4 py-3 font-medium">{t('orcado')}</th>
                <th className="text-right px-4 py-3 font-medium">{t('realizado')}</th>
                <th className="text-right px-4 py-3 font-medium">{t('servicos.colRealOrc')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {shown.length === 0 && <tr><td colSpan={group ? 7 : 8} className="px-4 py-10 text-center text-slate-400">{loading ? tc('loading') : t('servicos.noServices')}</td></tr>}
              {shown.map((r, i) => (
                <tr key={(r.service_id || r.supplier_id || '') + (r.category_id || '') + (group ? '' : r.unit_id) + i} className="hover:bg-slate-50/80 transition-colors">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <span className="w-7 h-7 rounded-full bg-navy-100 text-navy-700 flex items-center justify-center text-[10px] font-semibold shrink-0">{initials(r.supplier_name)}</span>
                      <span className="text-slate-700">{r.supplier_name ?? <span className="text-slate-400">{t('servicos.noSupplier')}</span>}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 text-xs">
                    {r.servico_nome ? <span className="text-slate-700 font-medium">{r.servico_nome}</span> : <span className="text-slate-400 italic">{t('servicos.noService')}</span>}
                    <div className="text-[11px] text-slate-400">{r.category_name ?? '—'}</div>
                  </td>
                  {!group && <td className="px-4 py-2.5 text-xs text-slate-500">{r.unidade_nome ?? r.unit_code ?? '—'}</td>}
                  <td className="px-4 py-2.5 text-center">
                    {r.rateado ? <span className="text-[11px] px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200">Rateio</span>
                      : <span className="text-[11px] px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200">{t('servicos.modeDireto')}</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs text-slate-500">{r.contratado ? money(r.contratado) : '—'}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs">{r.orcado ? money(r.orcado) : '—'}</td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="font-mono text-xs">{r.realizado ? money(r.realizado) : '—'}</div>
                    {r.orcado > 0 && (
                      <div className="mt-1 h-1 w-full max-w-[120px] ml-auto rounded-full bg-slate-100 overflow-hidden" title={t('servicos.subOrcPct', { p: (r.realizado / r.orcado * 100).toFixed(0) })}>
                        <div className={clsx('h-full rounded-full', r.realizado > r.orcado ? 'bg-bordeaux-500' : 'bg-emerald-500')} style={{ width: `${Math.min(100, r.realizado / r.orcado * 100)}%` }} />
                      </div>
                    )}
                  </td>
                  <td className={clsx('px-4 py-2.5 text-right font-mono text-xs', varCls(r.realizado, r.orcado))}>
                    {r.orcado || r.realizado ? (r.realizado - r.orcado >= 0 ? '+' : '') + money(r.realizado - r.orcado) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
            {shown.length > 0 && (
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-800">
                  <td className="px-4 py-2.5" colSpan={group ? 3 : 4}>{t('servicos.totalServices', { n: shown.length })}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs">{money(tot.contratado)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs">{money(tot.orcado)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs">{money(tot.realizado)}</td>
                  <td className={clsx('px-4 py-2.5 text-right font-mono text-xs', tot.realizado > tot.orcado ? 'text-red-600' : 'text-emerald-600')}>{(tot.realizado - tot.orcado >= 0 ? '+' : '') + money(tot.realizado - tot.orcado)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
      <p className="text-xs text-slate-400">{t('servicos.footnote')}</p>
    </div>
  )
}
