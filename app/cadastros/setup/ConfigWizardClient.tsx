'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, Check, CheckCircle2, RefreshCw, ExternalLink, Rocket, ClipboardCheck } from 'lucide-react'
import clsx from 'clsx'

type Ready = {
  currencies: number; platforms: number; countries: number; exchange: number
  companies: number; unidades: number; units: number
}

type Step = { key: keyof Ready; label: string; why: string; href: string }
const STEPS: Step[] = [
  { key: 'currencies', label: 'Moedas', why: 'As moedas (BRL, UYU, PYG) são usadas por país e no câmbio. Comece por elas.', href: '/cadastros/moedas' },
  { key: 'platforms', label: 'Plataformas / Regionais', why: 'A plataforma é a raiz da hierarquia — o país depende dela.', href: '/cadastros/plataformas' },
  { key: 'countries', label: 'Países', why: 'Cada país é vinculado a uma plataforma e a uma moeda.', href: '/cadastros/paises' },
  { key: 'exchange', label: 'Câmbio', why: 'Taxa por país/ano — necessária para consolidar em dólar (USD).', href: '/cadastros/cambio' },
  { key: 'companies', label: 'Empresas', why: 'As entidades legais. O Centro de Custo referencia a empresa.', href: '/cadastros/empresas' },
  { key: 'unidades', label: 'Unidades', why: 'As filiais, vinculadas ao país. Agrupam os centros de custo.', href: '/cadastros/unidades' },
  { key: 'units', label: 'Centros de custo', why: 'Vinculados a país + unidade + empresa. É onde budget e realizado batem.', href: '/cadastros/centro-custo' },
]

export default function ConfigWizardClient() {
  const [d, setD] = useState<Ready | null>(null)
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(true)
  const [touched, setTouched] = useState(false) // já posicionou no 1º pendente?

  const load = useCallback(async () => {
    setLoading(true)
    try { const r = await fetch('/api/readiness').then(x => x.json()); if (!r?.error) setD(r) } catch {}
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const doneOf = (s: Step) => !!d && Number(d[s.key]) > 0
  const countOf = (s: Step) => (d ? Number(d[s.key]) : 0)
  const readyCount = d ? STEPS.filter(doneOf).length : 0
  const pct = Math.round(readyCount / STEPS.length * 100)
  const allDone = readyCount === STEPS.length

  // na 1ª carga, posiciona no primeiro passo pendente
  useEffect(() => {
    if (d && !touched) {
      const idx = STEPS.findIndex(s => !doneOf(s))
      setStep(idx < 0 ? STEPS.length - 1 : idx)
      setTouched(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d])

  const cur = STEPS[step]
  const curDone = cur && doneOf(cur)

  return (
    <div className="page">
      <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
        <div>
          <Link href="/prontidao" className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1 mb-1"><ArrowLeft className="w-3 h-3" /> Saúde do cadastro</Link>
          <h1 className="page-title flex items-center gap-2"><Rocket className="w-5 h-5 text-blue-600" /> Configuração guiada da estrutura</h1>
          <p className="text-sm text-slate-500">Primeira vez? Siga os 7 passos na ordem — cada um depende do anterior.</p>
        </div>
        <button onClick={load} className="btn-secondary text-sm flex items-center gap-1.5"><RefreshCw className={clsx('w-4 h-4', loading && 'animate-spin')} /> Atualizar</button>
      </div>

      {/* progresso + trilha de passos */}
      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        <div className={clsx('rounded-2xl p-5 text-white shadow-sm bg-gradient-to-br', allDone ? 'from-teal-600 to-emerald-500' : 'from-navy-700 to-navy-500')}>
          <p className="text-[11px] uppercase tracking-wide text-white/70">Progresso</p>
          <p className="text-3xl font-bold font-mono mt-1 leading-none">{pct}%</p>
          <p className="text-[11px] text-white/70 mt-1.5">{readyCount} de {STEPS.length} passos prontos</p>
          <div className="mt-3 h-1.5 w-full rounded-full bg-white/20 overflow-hidden"><div className="h-full rounded-full bg-white/90" style={{ width: `${pct}%` }} /></div>
        </div>
        <div className="lg:col-span-2 card p-3 rounded-2xl">
          <div className="flex flex-col">
            {STEPS.map((s, i) => {
              const done = doneOf(s)
              return (
                <button key={s.key} onClick={() => setStep(i)}
                  className={clsx('flex items-center gap-3 px-2.5 py-2 rounded-lg text-left transition-colors', i === step ? 'bg-blue-50/60' : 'hover:bg-slate-50')}>
                  <span className={clsx('w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0',
                    done ? 'bg-emerald-500 text-white' : i === step ? 'bg-navy-700 text-white' : 'bg-slate-100 text-slate-400')}>
                    {done ? <Check className="w-3.5 h-3.5" /> : i + 1}
                  </span>
                  <span className={clsx('text-sm flex-1 min-w-0 truncate', i === step ? 'text-slate-800 font-medium' : 'text-slate-600')}>{s.label}</span>
                  <span className="text-[11px] text-slate-400 tabular-nums">{countOf(s)}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {allDone ? (
        <div className="card p-6 rounded-2xl text-center">
          <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
          <h2 className="font-semibold text-slate-800">Estrutura completa</h2>
          <p className="text-sm text-slate-500 mt-1">Você já pode cadastrar fornecedores, carregar o budget e lançar o realizado.</p>
          <div className="flex justify-center gap-2 mt-5">
            <Link href="/cadastros/fornecedores" className="btn-secondary text-sm">Cadastrar fornecedores</Link>
            <Link href="/budget/upload" className="btn-primary text-sm">Ir ao Budget</Link>
          </div>
        </div>
      ) : cur && (
        <div className="card p-6 rounded-2xl">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Passo {step + 1} de {STEPS.length}</span>
            {curDone
              ? <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-medium">Feito · {countOf(cur)} cadastrado(s)</span>
              : <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium">Pendente</span>}
          </div>
          <h2 className="text-lg font-semibold text-slate-800">{cur.label}</h2>
          <p className="text-sm text-slate-500 mt-1 max-w-xl">{cur.why}</p>
          <div className="mt-4">
            <Link href={cur.href} className="btn-primary text-sm inline-flex items-center gap-1.5">
              {curDone ? 'Rever' : 'Abrir'} {cur.label} <ExternalLink className="w-3.5 h-3.5" />
            </Link>
            <p className="text-[11px] text-slate-400 mt-2">Cadastre e volte aqui — clique em <b>Atualizar</b> para ver o progresso.</p>
          </div>
        </div>
      )}

      {/* navegação */}
      {!allDone && (
        <div className="flex items-center justify-between mt-5">
          <button onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}
            className={clsx('btn-secondary text-sm flex items-center gap-1.5', step === 0 && 'opacity-50 cursor-not-allowed')}>
            <ArrowLeft className="w-4 h-4" /> Anterior
          </button>
          <Link href="/prontidao" className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1"><ClipboardCheck className="w-3.5 h-3.5" /> Ver tudo na Saúde do cadastro</Link>
          <button onClick={() => setStep(Math.min(STEPS.length - 1, step + 1))} disabled={step === STEPS.length - 1}
            className={clsx('btn-primary text-sm flex items-center gap-1.5', step === STEPS.length - 1 && 'opacity-50 cursor-not-allowed')}>
            Próximo <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  )
}
