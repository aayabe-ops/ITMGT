'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { Shield, RefreshCw, Download, Search, LogIn, Activity, List } from 'lucide-react'
import clsx from 'clsx'

interface Row { id: string; ts: string; user_email: string | null; action: string; entity: string | null; entity_id: string | null; detail: string | null; ip: string | null }
interface Kpi { logins_24h: number; fails_24h: number; users_7d: number; changes_7d: number }

const ACTION_CLS: Record<string, string> = {
  LOGIN_OK: 'bg-emerald-50 text-emerald-700', LOGIN_FAIL: 'bg-rose-50 text-rose-700', LOGOUT: 'bg-slate-100 text-slate-600',
  CREATE: 'bg-blue-50 text-blue-700', UPDATE: 'bg-amber-50 text-amber-700', DELETE: 'bg-rose-50 text-rose-700',
  IMPORT: 'bg-violet-50 text-violet-700', LANG: 'bg-slate-100 text-slate-600',
}

export default function MonitoringClient() {
  const t = useTranslations('mon')
  const tc = useTranslations('common')
  const locale = useLocale()
  const fmtTs = (s: string) => new Date(s).toLocaleString(locale === 'pt' ? 'pt-BR' : locale, { dateStyle: 'short', timeStyle: 'medium' })
  const actionLabel = (a: string) => { try { return t(`a${a}` as any) } catch { return a } }

  const [tab, setTab] = useState<'ACCESS' | 'ACTIVITY' | 'ALL'>('ACCESS')
  const [user, setUser] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [kpi, setKpi] = useState<Kpi | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const p = new URLSearchParams()
    if (tab !== 'ALL') p.set('group', tab)
    if (user.trim()) p.set('user', user.trim())
    if (from) p.set('from', from)
    if (to) p.set('to', to)
    const res = await fetch('/api/monitoring?' + p.toString())
    const d = res.ok ? await res.json() : { rows: [], kpi: null }
    setRows(Array.isArray(d.rows) ? d.rows : [])
    setKpi(d.kpi || null)
    setLoading(false)
  }, [tab, user, from, to])
  useEffect(() => { load() }, [tab])

  function exportCsv() {
    const header = 'quando,usuario,acao,objeto,objeto_id,detalhe,ip'
    const esc = (s: any) => { const v = String(s ?? ''); return /[",;\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v }
    const body = rows.map(r => [fmtTs(r.ts), r.user_email, actionLabel(r.action), r.entity, r.entity_id, r.detail, r.ip].map(esc).join(','))
    const blob = new Blob(['﻿' + header + '\n' + body.join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `monitoring_${new Date().toISOString().slice(0, 10)}.csv`; a.click()
  }

  const kpis = useMemo(() => kpi ? [
    { label: t('logins24h'), value: kpi.logins_24h, Icon: LogIn, color: 'text-emerald-700' },
    { label: t('fails24h'), value: kpi.fails_24h, Icon: Shield, color: kpi.fails_24h > 0 ? 'text-rose-600' : 'text-slate-700' },
    { label: t('users7d'), value: kpi.users_7d, Icon: Activity, color: 'text-blue-700' },
    { label: t('changes7d'), value: kpi.changes_7d, Icon: List, color: 'text-navy-800' },
  ] : [], [kpi, t])

  const TABS: [typeof tab, string, any][] = [['ACCESS', t('tabAccess'), LogIn], ['ACTIVITY', t('tabActivity'), Activity], ['ALL', t('tabAll'), List]]

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-navy-50 text-navy-700"><Shield className="h-5 w-5" /></span>
          <div>
            <h1 className="text-xl font-semibold text-navy-800">{t('title')}</h1>
            <p className="text-sm text-slate-500">{t('subtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="btn-secondary text-sm flex items-center gap-1.5"><RefreshCw className={clsx('w-4 h-4', loading && 'animate-spin')} /> {t('refresh')}</button>
          <button onClick={exportCsv} disabled={!rows.length} className="btn-secondary text-sm flex items-center gap-1.5"><Download className="w-4 h-4" /> {t('csv')}</button>
        </div>
      </div>

      {/* KPIs */}
      <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map(k => (
          <div key={k.label} className="rounded-xl bg-white border border-slate-200 p-4">
            <div className="flex items-center gap-1.5 text-xs text-slate-500"><k.Icon className="h-4 w-4" /> {k.label}</div>
            <div className={clsx('mt-1 text-2xl font-semibold', k.color)}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Abas */}
      <div className="mt-5 flex gap-1 border-b border-slate-200 flex-wrap">
        {TABS.map(([v, label, Icon]) => (
          <button key={v} onClick={() => setTab(v)}
            className={clsx('px-4 py-2 text-sm font-medium border-b-2 -mb-px inline-flex items-center gap-1.5', tab === v ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700')}>
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px]">
          <label className="label">{t('fUser')}</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className="input pl-10" value={user} onChange={e => setUser(e.target.value)} onKeyDown={e => e.key === 'Enter' && load()} placeholder="nome@emergentcold.com" />
          </div>
        </div>
        <div><label className="label">{t('fFrom')}</label><input type="date" className="input" value={from} onChange={e => setFrom(e.target.value)} /></div>
        <div><label className="label">{t('fTo')}</label><input type="date" className="input" value={to} onChange={e => setTo(e.target.value)} /></div>
        <button onClick={load} className="btn-navy">{t('refresh')}</button>
      </div>

      {/* Tabela */}
      <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">{t('colWhen')}</th>
              <th className="px-4 py-3">{t('colUser')}</th>
              <th className="px-4 py-3">{t('colAction')}</th>
              <th className="px-4 py-3">{t('colEntity')}</th>
              <th className="px-4 py-3">{t('colDetail')}</th>
              <th className="px-4 py-3">{t('colIp')}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">{tc('loading')}</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">{t('empty')}</td></tr>
            ) : rows.map(r => (
              <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap font-mono text-xs">{fmtTs(r.ts)}</td>
                <td className="px-4 py-2.5 text-slate-700">{r.user_email || '—'}</td>
                <td className="px-4 py-2.5"><span className={clsx('inline-block rounded-full px-2 py-0.5 text-xs font-medium', ACTION_CLS[r.action] || 'bg-slate-100 text-slate-600')}>{actionLabel(r.action)}</span></td>
                <td className="px-4 py-2.5 text-slate-500 text-xs">{r.entity || '—'}</td>
                <td className="px-4 py-2.5 text-slate-600 text-xs max-w-md truncate" title={r.detail || ''}>{r.detail || '—'}</td>
                <td className="px-4 py-2.5 text-slate-400 text-xs font-mono">{r.ip || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-400">{t('count', { n: rows.length })}</p>
    </div>
  )
}
