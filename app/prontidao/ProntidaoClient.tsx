'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, AlertTriangle, XCircle, ArrowRight, RefreshCw, ClipboardCheck, Settings2, Rocket } from 'lucide-react'

type Ready = {
  currencies: number; platforms: number; countries: number; exchange: number
  companies: number; unidades: number; units: number; units_orphan: number
  categories: number; suppliers: number; contracts: number; projects: number
  drivers: number; criteria: number; driver_bases: number
  gates: { budget: boolean; rateio: boolean }
}
type Rule = { status: string; driver_kind: string; weights_sum?: number; unit_ids?: string[] }

// mesma lógica do RateioClient.readiness()
function ruleState(r: Rule): 'ready' | 'draft' | 'weights' | 'nocc' | 'inactive' {
  if (r.status === 'INACTIVE') return 'inactive'
  if (r.status !== 'ACTIVE') return 'draft'
  if (r.driver_kind === 'MANUAL' && Math.abs((Number(r.weights_sum) || 0) - 100) > 0.01) return 'weights'
  if (!(r.unit_ids || []).length) return 'nocc'
  return 'ready'
}

type Sev = 'ok' | 'warn' | 'block'
function Dot({ sev }: { sev: Sev }) {
  const map = { ok: 'bg-emerald-500', warn: 'bg-amber-500', block: 'bg-red-500' }
  return <span className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${map[sev]}`} />
}

function Line({ sev, label, count, note, href }:
  { sev: Sev; label: string; count: number; note?: string; href: string }) {
  return (
    <Link href={href}
      className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-50 transition-colors group">
      <Dot sev={sev} />
      <span className="text-sm text-slate-700 flex-1 min-w-0">{label}</span>
      {note && <span className={`text-[11px] ${sev === 'warn' ? 'text-amber-600' : 'text-slate-400'}`}>{note}</span>}
      <span className="text-sm font-semibold tabular-nums text-slate-800 w-10 text-right">{count}</span>
      <ArrowRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-500" />
    </Link>
  )
}

export default function ProntidaoClient() {
  const [d, setD] = useState<Ready | null>(null)
  const [rules, setRules] = useState<Rule[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  async function load() {
    setLoading(true); setErr('')
    try {
      const [r1, r2] = await Promise.all([
        fetch('/api/readiness').then(r => r.json()),
        fetch('/api/rateio').then(r => r.json()).catch(() => []),
      ])
      if (r1?.error) setErr(r1.error); else setD(r1)
      setRules(Array.isArray(r2) ? r2 : (Array.isArray(r2?.rows) ? r2.rows : []))
    } catch (e: any) { setErr(e?.message || 'Erro ao carregar.') }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const sevCount = (n: number): Sev => (n > 0 ? 'ok' : 'block')

  // Passos da estrutura, na ordem de dependência — fonte única p/ progresso, pendências e lista.
  type Step = { label: string; count: number; sev: Sev; note?: string; href: string }
  const steps: Step[] = d ? [
    { label: 'Moedas', count: d.currencies, sev: sevCount(d.currencies), href: '/cadastros/moedas' },
    { label: 'Plataformas', count: d.platforms, sev: sevCount(d.platforms), href: '/cadastros/plataformas' },
    { label: 'Países', count: d.countries, sev: sevCount(d.countries), href: '/cadastros/paises' },
    { label: 'Câmbio', count: d.exchange, sev: d.exchange > 0 ? 'ok' : 'warn', note: d.exchange > 0 ? undefined : 'sem taxa — necessário p/ USD', href: '/cadastros/cambio' },
    { label: 'Empresas', count: d.companies, sev: sevCount(d.companies), href: '/cadastros/empresas' },
    { label: 'Unidades', count: d.unidades, sev: sevCount(d.unidades), href: '/cadastros/unidades' },
    { label: 'Centro de Custo', count: d.units, sev: d.units === 0 ? 'block' : d.units_orphan > 0 ? 'warn' : 'ok', note: d.units_orphan > 0 ? `${d.units_orphan} sem unidade` : undefined, href: '/cadastros/centro-custo' },
    { label: 'Categorias', count: d.categories, sev: sevCount(d.categories), href: '/cadastros/categorias' },
    { label: 'Fornecedores', count: d.suppliers, sev: sevCount(d.suppliers), href: '/cadastros/fornecedores' },
  ] : []
  const readyCount = steps.filter(s => s.sev === 'ok').length
  const pct = steps.length ? Math.round(readyCount / steps.length * 100) : 0
  const pending = steps.filter(s => s.sev !== 'ok')

  return (
    <div className="page">
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-blue-600" /> Saúde do cadastro
          </h1>
          <p className="text-sm text-slate-500">O que já está cadastrado e o que falta para <b>orçar</b> e para <b>ratear</b>.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/cadastros/setup" className="btn-primary text-sm flex items-center gap-1.5">
            <Rocket className="w-4 h-4" /> Configuração guiada
          </Link>
          <button onClick={load} className="btn-secondary text-sm flex items-center gap-1.5">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar
          </button>
        </div>
      </div>

      {err && (
        <div className="mb-4 flex items-center gap-2 px-4 py-2 rounded-lg text-sm bg-red-50 text-red-700">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {err}
        </div>
      )}

      {d && (
        <>
          {/* Progresso geral + próximas pendências */}
          <div className="grid lg:grid-cols-3 gap-4 mb-6">
            <div className={`rounded-2xl p-5 text-white shadow-sm bg-gradient-to-br ${pct === 100 ? 'from-teal-600 to-emerald-500' : 'from-navy-700 to-navy-500'}`}>
              <p className="text-[11px] uppercase tracking-wide text-white/70">Progresso da estrutura</p>
              <p className="text-3xl font-bold font-mono mt-1 leading-none">{pct}%</p>
              <p className="text-[11px] text-white/70 mt-1.5">{readyCount} de {steps.length} passos prontos</p>
              <div className="mt-3 h-1.5 w-full rounded-full bg-white/20 overflow-hidden">
                <div className="h-full rounded-full bg-white/90" style={{ width: `${pct}%` }} />
              </div>
            </div>
            <div className="lg:col-span-2 card p-4 rounded-2xl">
              <h2 className="font-semibold text-slate-800 text-sm px-1 pb-2 flex items-center gap-2">
                {pending.length === 0
                  ? <><CheckCircle2 className="w-4 h-4 text-emerald-600" /> Tudo pronto — nada pendente</>
                  : <><AlertTriangle className="w-4 h-4 text-amber-500" /> Pendências — resolva nesta ordem</>}
              </h2>
              {pending.length === 0 ? (
                <p className="text-sm text-slate-500 px-1">Sua estrutura está completa. Você já pode orçar e lançar.</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {pending.map((s, i) => (
                    <Link key={s.label} href={s.href}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg border border-slate-100 hover:border-blue-200 hover:bg-blue-50/40 transition-colors group">
                      <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-500 text-[11px] font-semibold flex items-center justify-center shrink-0">{i + 1}</span>
                      <Dot sev={s.sev} />
                      <span className="text-sm text-slate-700 flex-1 min-w-0 truncate">{s.label}{s.note ? <span className="text-amber-600 font-normal"> · {s.note}</span> : s.count === 0 ? <span className="text-slate-400 font-normal"> · nenhum cadastrado</span> : null}</span>
                      <span className="text-xs text-blue-600 font-medium flex items-center gap-1 shrink-0">Resolver <ArrowRight className="w-3.5 h-3.5" /></span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Portões */}
          <div className="grid sm:grid-cols-2 gap-4 mb-6">
            {[
              { ok: d.gates.budget, title: 'Pronto para Orçar', need: 'Unidades · Centro de Custo · Categorias', href: '/budget/upload', cta: 'Ir ao Budget' },
              { ok: d.gates.rateio, title: 'Pronto para Ratear', need: 'Drivers · Critérios · Bases dos drivers', href: '/rateio', cta: 'Ir ao Rateio' },
            ].map(g => (
              <div key={g.title} className={`card p-5 border ${g.ok ? 'border-emerald-100' : 'border-amber-100'}`}>
                <div className="flex items-center gap-2 mb-1">
                  {g.ok ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : <AlertTriangle className="w-5 h-5 text-amber-500" />}
                  <h2 className="font-semibold text-slate-800">{g.title}</h2>
                  <span className={`ml-auto text-xs font-medium px-2 py-0.5 rounded-full ${g.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                    {g.ok ? 'Pronto' : 'Faltam itens'}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mb-3">Requer: {g.need}</p>
                <Link href={g.href} className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                  {g.cta} <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            ))}
          </div>

          {/* Cadastro (ordem de dependência) */}
          <div className="card p-4 mb-6">
            <h2 className="font-semibold text-slate-800 px-2 pb-1 pt-1 text-sm">Cadastro — na ordem de dependência</h2>
            <div className="divide-y divide-slate-50">
              {steps.map(s => <Line key={s.label} sev={s.sev} label={s.label} count={s.count} note={s.note} href={s.href} />)}
            </div>
          </div>

          {/* Rateio */}
          <div className="card p-4">
            <h2 className="font-semibold text-slate-800 px-2 pb-1 pt-1 text-sm flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-slate-400" /> Rateio
            </h2>
            <div className="divide-y divide-slate-50 mb-3">
              <Line sev={sevCount(d.drivers)} label="Drivers (critérios de distribuição)" count={d.drivers} href="/rateio" />
              <Line sev={sevCount(d.criteria)} label="Regras de rateio" count={d.criteria} href="/rateio" />
              <Line sev={d.driver_bases > 0 ? 'ok' : 'warn'} label="Drivers com base de dados" count={d.driver_bases}
                note={d.driver_bases > 0 ? undefined : 'sem base — VALUE não calcula'} href="/rateio" />
            </div>
            {rules.length > 0 && (() => {
              const g = { ready: 0, draft: 0, weights: 0, nocc: 0, inactive: 0 }
              rules.forEach(r => { g[ruleState(r)]++ })
              const chips: { k: keyof typeof g; label: string; cls: string }[] = [
                { k: 'ready', label: 'Prontas', cls: 'bg-emerald-50 text-emerald-700' },
                { k: 'weights', label: 'Pesos ≠ 100%', cls: 'bg-orange-50 text-orange-700' },
                { k: 'nocc', label: 'Sem centro de custo', cls: 'bg-orange-50 text-orange-700' },
                { k: 'draft', label: 'Rascunho', cls: 'bg-amber-50 text-amber-700' },
                { k: 'inactive', label: 'Inativas', cls: 'bg-slate-100 text-slate-500' },
              ]
              return (
                <div className="flex flex-wrap gap-2 px-2">
                  {chips.filter(c => g[c.k] > 0).map(c => (
                    <span key={c.k} className={`text-xs font-medium px-2.5 py-1 rounded-full ${c.cls}`}>
                      {g[c.k]} {c.label}
                    </span>
                  ))}
                </div>
              )
            })()}
          </div>
        </>
      )}

      {loading && !d && <div className="text-sm text-slate-400 py-10 text-center">Carregando…</div>}
    </div>
  )
}
