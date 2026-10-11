'use client'
import clsx from 'clsx'
import type { LucideIcon } from 'lucide-react'

// Hero tile — KPI com gradiente SUTIL da marca (navy/azul/teal/bordô). Padrão único
// usado em todos os relatórios. As classes de gradiente são literais p/ o JIT do Tailwind.
export type HeroVariant = 'navy' | 'blue' | 'teal' | 'bordeaux' | 'amber' | 'violet' | 'slate'
const GRAD: Record<HeroVariant, string> = {
  navy: 'from-navy-700 to-navy-500',
  blue: 'from-blue-700 to-blue-500',
  teal: 'from-teal-600 to-emerald-500',
  bordeaux: 'from-bordeaux-600 to-bordeaux-400',
  amber: 'from-amber-500 to-orange-500',
  violet: 'from-violet-600 to-violet-500',
  slate: 'from-slate-600 to-slate-500',
}

export interface HeroTile { label: string; value: string; sub?: string; variant?: HeroVariant; Icon?: LucideIcon }

// variante automática por sinal: estouro = bordô, economia/positivo = teal
export const signVariant = (over: boolean): HeroVariant => (over ? 'bordeaux' : 'teal')

export function StatHero({ label, value, sub, variant = 'navy', Icon }: HeroTile) {
  return (
    <div className={clsx('relative rounded-2xl p-4 text-white shadow-sm bg-gradient-to-br', GRAD[variant])}>
      {Icon && <Icon className="w-5 h-5 text-white/40 absolute top-3.5 right-3.5" aria-hidden />}
      <p className="text-[11px] uppercase tracking-wide text-white/70 pr-6">{label}</p>
      <p className="text-2xl font-bold font-mono mt-1.5 leading-none">{value}</p>
      <p className="text-[11px] text-white/70 mt-1.5 h-3">{sub || ''}</p>
    </div>
  )
}

export function StatHeroRow({ tiles, className }: { tiles: HeroTile[]; className?: string }) {
  return (
    <div className={clsx('grid grid-cols-2 md:grid-cols-4 gap-4', className)}>
      {tiles.map(t => <StatHero key={t.label} {...t} />)}
    </div>
  )
}
