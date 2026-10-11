'use client'
import { useState } from 'react'
import { Lightbulb, ChevronDown, ChevronUp } from 'lucide-react'

// Painel-guia reutilizável ("Como preencher") no topo dos cadastros.
// Recolhível; lembra o estado por tela via localStorage (best-effort).
export default function GuideCard({ title = 'Como preencher', steps, note, storageKey }: {
  title?: string; steps: string[]; note?: string; storageKey?: string
}) {
  const key = storageKey ? `guide:${storageKey}` : ''
  const [open, setOpen] = useState<boolean>(() => {
    if (!key) return true
    try { return localStorage.getItem(key) !== '0' } catch { return true }
  })
  function toggle() {
    const v = !open; setOpen(v)
    try { if (key) localStorage.setItem(key, v ? '1' : '0') } catch { /* ignore */ }
  }
  return (
    <div className="mb-5 overflow-hidden rounded-xl border border-navy-100 bg-navy-50/60">
      <button type="button" onClick={toggle} className="flex w-full items-center gap-2 px-4 py-2.5 text-left">
        <Lightbulb className="h-4 w-4 shrink-0 text-bordeaux" />
        <span className="text-sm font-semibold text-navy-800">{title}</span>
        <span className="ml-auto text-navy-400">{open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</span>
      </button>
      {open && (
        <div className="px-4 pb-3">
          <ol className="ml-1 space-y-1.5">
            {steps.map((s, i) => (
              <li key={i} className="flex gap-2 text-sm text-slate-600">
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-navy-700 text-[10px] font-semibold text-white">{i + 1}</span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
          {note && <p className="mt-2.5 rounded-lg bg-amber-50 px-3 py-1.5 text-xs text-amber-700">⚠ {note}</p>}
        </div>
      )}
    </div>
  )
}
