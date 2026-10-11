'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ShieldCheck, ArrowRight, Lock } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error || 'Erro ao entrar'); setLoading(false) }
    else router.push('/')
  }

  return (
    <div className="min-h-screen grid md:grid-cols-2">
      {/* Painel esquerdo — foto do armazém */}
      <div className="relative flex flex-col justify-between overflow-hidden bg-navy-900 px-8 py-8 text-white md:px-12 md:py-12 min-h-[220px] md:min-h-screen">
        <img src="/bg-edge.jpg" alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover object-center" />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-navy-900/90 via-navy-900/45 to-navy-900/85" />

        <div className="relative">
          <img src="/logo-white.webp" alt="Emergent Cold LatAm" className="h-10 w-auto md:h-12" />
        </div>

        <div className="relative hidden max-w-md md:block">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">Acesso seguro às operações</p>
          <h1 className="mt-4 text-3xl font-semibold leading-tight md:text-[2.1rem]">
            Gestão de custos de TI, governada por papel e escopo.
          </h1>
          <div className="mt-8 space-y-3">
            <Feature label="OPEX/CAPEX" text="Budget, Realizado e Forecast" />
            <Feature label="Escopo" text="País, unidade, fornecedor e contrato" />
            <Feature label="Rateio" text="Distribuição por driver e memória de cálculo" />
          </div>
        </div>

        <p className="relative hidden text-xs text-white/50 md:block">emergentcoldlatam.com</p>
      </div>

      {/* Painel direito — login */}
      <div className="flex items-center justify-center bg-slate-50 px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-navy-50 text-navy-700">
              <ShieldCheck className="h-[18px] w-[18px]" strokeWidth={2} />
            </span>
            <h2 className="text-xl font-semibold text-navy-800">Entrar</h2>
          </div>
          <p className="mt-2 mb-6 text-sm leading-relaxed text-slate-500">
            Acesse o painel com suas credenciais corporativas.
          </p>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="label">E-mail</label>
              <input type="email" className="input" value={email} onChange={e => setEmail(e.target.value)} required autoFocus placeholder="voce@emergentcold.com" />
            </div>
            <div>
              <label className="label">Senha</label>
              <input type="password" className="input" value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••" />
            </div>
            {error && (
              <p className="rounded-lg border border-bordeaux-100 bg-bordeaux-50 px-3 py-2 text-xs text-bordeaux-700">{error}</p>
            )}
            <button type="submit" disabled={loading} className="btn-navy w-full justify-center py-3">
              {loading ? 'Entrando…' : <>Acessar painel <ArrowRight className="h-4 w-4" /></>}
            </button>
          </form>

          <p className="mt-7 flex items-center justify-center gap-1.5 text-center text-xs text-slate-400">
            <Lock className="h-3 w-3" /> Sessão protegida · © {new Date().getFullYear()} Emergent Cold LatAm
          </p>
        </div>
      </div>
    </div>
  )
}

/* Barra de feature do painel esquerdo */
function Feature({ label, text }: { label: string; text: string }) {
  return (
    <div className="flex items-center gap-4 rounded-xl bg-white/10 px-4 py-3 ring-1 ring-white/15 backdrop-blur-sm">
      <span className="w-24 shrink-0 text-sm font-semibold text-white">{label}</span>
      <span className="text-sm leading-snug text-white/80">{text}</span>
    </div>
  )
}
