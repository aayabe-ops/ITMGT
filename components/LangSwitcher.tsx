'use client'
import { useLocale } from 'next-intl'
import { useState } from 'react'
import clsx from 'clsx'

const LANGS = [{ code: 'pt', label: 'PT' }, { code: 'es', label: 'ES' }, { code: 'en', label: 'EN' }]

export default function LangSwitcher() {
  const locale = useLocale()
  const [busy, setBusy] = useState(false)
  async function change(l: string) {
    if (l === locale || busy) return
    setBusy(true)
    try {
      await fetch('/api/me/lang', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lang: l }) })
    } catch {}
    window.location.reload()
  }
  return (
    <div className="flex gap-1">
      {LANGS.map(l => (
        <button key={l.code} onClick={() => change(l.code)} disabled={busy}
          className={clsx('px-2 py-1 rounded text-xs font-medium transition-colors',
            l.code === locale ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white')}>
          {l.label}
        </button>
      ))}
    </div>
  )
}
