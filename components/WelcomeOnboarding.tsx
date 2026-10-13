'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { X, Check, Rocket, FileText, BarChart3 } from 'lucide-react'
import clsx from 'clsx'

const KEY = 'itcost_welcome_v1'
const PHASES = ['Estrutura', 'Budget', 'Ordem de pagamento', 'Relatórios']

type Variant = 'setup' | 'operar' | 'acompanhar'
const variantOf = (role: string): Variant =>
  role === 'admin' ? 'setup'
  : (role === 'gerente' || role === 'analista' || role === 'lancador') ? 'operar'
  : 'acompanhar'

// Primeira experiência (item 9): boas-vindas adaptada ao papel, aparece 1x e é dispensável.
export default function WelcomeOnboarding({ user }: { user: { role: string; full_name?: string | null; email?: string } }) {
  const [show, setShow] = useState(false)
  useEffect(() => {
    try { if (localStorage.getItem(KEY) !== 'done') setShow(true) } catch { setShow(true) }
  }, [])
  if (!show) return null
  const dismiss = () => { try { localStorage.setItem(KEY, 'done') } catch {} ; setShow(false) }

  const v = variantOf(user.role)
  const first = (user.full_name || user.email || '').trim().split(/\s+/)[0] || ''
  const current = v === 'setup' ? 0 : v === 'operar' ? 2 : 3
  const lede = v === 'setup'
    ? 'Aqui você controla o orçamento de TI — da estrutura da empresa até o pagamento, com o realizado batendo no orçado.'
    : v === 'operar'
    ? 'Seu trabalho é simples: lançar os pagamentos dos fornecedores e acompanhar. A estrutura já foi configurada pela equipe.'
    : 'Acompanhe o orçamento de TI de todas as unidades — orçado, realizado e desvios, em um só lugar.'

  return (
    <div className="relative rounded-2xl overflow-hidden border border-slate-100 shadow-sm mb-6">
      <button onClick={dismiss} aria-label="Fechar" className="absolute top-3 right-3 z-10 p-1 rounded-lg text-white/70 hover:text-white hover:bg-white/10"><X className="w-5 h-5" /></button>

      <div className="bg-gradient-to-br from-navy-800 to-navy-900 px-6 py-6 text-white">
        <div className="text-[11px] font-semibold tracking-wide text-blue-200/90">IT Cost Manager · Emergent Cold LatAm</div>
        <h2 className="text-2xl font-bold mt-1">{first ? `Bem-vindo, ${first}` : 'Bem-vindo'}</h2>
        <p className="text-sm text-slate-200/90 mt-1 max-w-2xl">{lede}</p>
      </div>

      <div className="bg-white px-6 py-5">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-3">{v === 'operar' ? 'Onde você entra' : 'O caminho'}</div>
        <div className="flex gap-2.5 flex-wrap">
          {PHASES.map((p, i) => {
            const done = i < current, now = i === current
            return (
              <div key={p} className={clsx('flex-1 min-w-[150px] rounded-xl border p-3', now ? 'border-bordeaux-600 ring-1 ring-bordeaux-600' : 'border-slate-100')}>
                <div className="flex items-center gap-2">
                  <span className={clsx('w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0', done ? 'bg-emerald-500 text-white' : now ? 'bg-bordeaux-600 text-white' : 'bg-slate-100 text-slate-400')}>
                    {done ? <Check className="w-3.5 h-3.5" /> : i + 1}
                  </span>
                  <span className="text-[13px] font-semibold text-slate-800 truncate">{p}</span>
                </div>
                <div className={clsx('text-[11px] mt-1.5', now ? 'text-bordeaux-600 font-semibold' : 'text-slate-400')}>
                  {now ? 'Você está aqui' : done ? 'Pronto' : '—'}
                </div>
              </div>
            )
          })}
        </div>

        <div className="mt-5 rounded-xl p-4 bg-gradient-to-br from-bordeaux-50/70 to-blue-50/50 border border-slate-100">
          {v === 'setup' && (<>
            <h3 className="font-bold text-slate-800">Comece pela estrutura</h3>
            <p className="text-sm text-slate-500 mt-0.5 max-w-xl">Vamos montar a base em 7 passos, na ordem certa — moedas, países, empresas, unidades e centros de custo. Você pode parar e continuar depois.</p>
            <div className="flex gap-2 mt-4 flex-wrap">
              <Link href="/cadastros/setup" onClick={dismiss} className="btn-primary text-sm inline-flex items-center gap-1.5"><Rocket className="w-4 h-4" /> Começar configuração</Link>
              <button onClick={dismiss} className="btn-secondary text-sm">Ver depois</button>
            </div>
          </>)}
          {v === 'operar' && (<>
            <h3 className="font-bold text-slate-800">Seu dia a dia</h3>
            <p className="text-sm text-slate-500 mt-0.5 max-w-xl">Sem configuração. Os lançamentos chegam prontos, com unidade e centro de custo — você confere e marca como pago.</p>
            <ol className="mt-3 space-y-1.5 text-[13px] text-slate-700">
              <li>1. Abra <b>Ordem de pagamento</b> no menu.</li>
              <li>2. Os pagamentos do mês aparecem pré-preenchidos.</li>
              <li>3. Confira o valor e marque <b>pago</b>.</li>
            </ol>
            <div className="flex gap-2 mt-4">
              <Link href="/actual" onClick={dismiss} className="btn-primary text-sm inline-flex items-center gap-1.5"><FileText className="w-4 h-4" /> Ir para Ordem de pagamento</Link>
            </div>
          </>)}
          {v === 'acompanhar' && (<>
            <h3 className="font-bold text-slate-800">Acompanhe os números</h3>
            <p className="text-sm text-slate-500 mt-0.5 max-w-xl">Orçado × realizado, desvios e forecast — por unidade e consolidado.</p>
            <div className="flex gap-2 mt-4">
              <Link href="/report" onClick={dismiss} className="btn-primary text-sm inline-flex items-center gap-1.5"><BarChart3 className="w-4 h-4" /> Ver relatórios</Link>
            </div>
          </>)}
        </div>
      </div>
    </div>
  )
}
