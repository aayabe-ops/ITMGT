'use client'
import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronDown, Check } from 'lucide-react'
import clsx from 'clsx'

interface Opt { id: string; name: string; code?: string }

// Combo de múltipla escolha (dropdown com checkboxes). Fecha ao clicar fora.
export default function MultiSelect({
  options, value, onChange, placeholder, disabled = false, emptyHint, accent = 'blue',
}: {
  options: Opt[]
  value: string[]
  onChange: (ids: string[]) => void
  placeholder?: string
  disabled?: boolean
  emptyHint?: string
  accent?: 'blue' | 'violet'
}) {
  const t = useTranslations('lookup')
  const ph = placeholder ?? t('selectDots')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter(x => x !== id) : [...value, id])
  const label = (o: Opt) => (o.code ? `${o.code} — ${o.name}` : o.name)
  const selected = options.filter(o => value.includes(o.id))
  const onCls = accent === 'violet' ? 'bg-violet-600 border-violet-600' : 'bg-blue-600 border-blue-600'

  return (
    <div className="relative" ref={ref}>
      <button type="button" disabled={disabled} onClick={() => setOpen(o => !o)}
        className={clsx('input flex items-center justify-between gap-2 text-left w-full', disabled && 'opacity-50 cursor-not-allowed')}>
        <span className={clsx('truncate', !selected.length && 'text-slate-400')}>
          {selected.length ? (selected.length <= 2 ? selected.map(label).join(', ') : t('nSelected', { n: selected.length })) : ph}
        </span>
        <ChevronDown className={clsx('w-4 h-4 text-slate-400 shrink-0 transition-transform', open && 'rotate-180')} />
      </button>
      {open && !disabled && (
        <div className="absolute z-30 mt-1 w-full max-h-56 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg py-1">
          {options.length === 0 ? (
            <p className="px-3 py-2 text-xs text-slate-400">{emptyHint || t('noOptions')}</p>
          ) : (() => {
            const ids = options.map(o => o.id)
            const allOn = ids.every(id => value.includes(id))
            return (
              <button type="button"
                onClick={() => onChange(allOn ? value.filter(id => !ids.includes(id)) : [...new Set([...value, ...ids])])}
                className="w-full sticky top-0 bg-white flex items-center justify-between px-3 py-1.5 text-xs font-medium text-slate-500 border-b border-slate-100 hover:bg-slate-50">
                <span>{allOn ? t('clearSel') : t('selectAll')}</span>
                <span className="text-slate-400">{ids.filter(id => value.includes(id)).length}/{options.length}</span>
              </button>
            )
          })()}
          {options.map(o => {
            const on = value.includes(o.id)
            return (
              <button type="button" key={o.id} onClick={() => toggle(o.id)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-slate-50">
                <span className={clsx('w-4 h-4 rounded border flex items-center justify-center shrink-0', on ? onCls : 'border-slate-300')}>
                  {on && <Check className="w-3 h-3 text-white" />}
                </span>
                <span className="truncate text-slate-700">{label(o)}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
