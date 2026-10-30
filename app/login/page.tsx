'use client'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { ShieldCheck, ArrowRight, Lock, Mail, Snowflake, LifeBuoy } from 'lucide-react'

export default function LoginPage() {
  const t = useTranslations('login')
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
    if (!res.ok) { setError(data.error || t('error')); setLoading(false) }
    // Recarga total (não router.push) para limpar o Router Cache do Next e não
    // herdar o menu/estado renderizado para outro usuário na mesma aba.
    else window.location.href = '/'
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-8">
      {/* Card flutuante dividido */}
      <div className="grid w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-[0_18px_50px_-12px_rgba(20,30,60,0.28)] md:grid-cols-2">

        {/* Painel esquerdo — formulário */}
        <div className="flex flex-col px-8 py-10 md:px-12 md:py-12">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-navy-700 text-white">
              <ShieldCheck className="h-[18px] w-[18px]" strokeWidth={2} />
            </span>
            <span className="text-sm font-semibold text-navy-800">IT Cost Manager</span>
          </div>

          <h1 className="mt-8 text-2xl font-semibold text-navy-800">{t('welcome')}</h1>
          <p className="mt-2 mb-7 text-sm leading-relaxed text-slate-500">{t('subtitle')}</p>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="label">{t('email')}</label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input type="email" className="input pl-10" value={email} onChange={e => setEmail(e.target.value)} required autoFocus placeholder="voce@emergentcold.com" />
              </div>
            </div>
            <div>
              <label className="label">{t('password')}</label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input type="password" className="input pl-10" value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••" />
              </div>
            </div>
            {error && (
              <p className="rounded-lg border border-bordeaux-100 bg-bordeaux-50 px-3 py-2 text-xs text-bordeaux-700">{error}</p>
            )}
            <button type="submit" disabled={loading} className="btn-navy w-full justify-center py-3">
              {loading ? t('submitting') : <>{t('submit')} <ArrowRight className="h-4 w-4" /></>}
            </button>
          </form>

          <div className="mt-7 flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <LifeBuoy className="mt-0.5 h-4 w-4 shrink-0 text-navy-600" />
            <div>
              <p className="text-xs font-semibold text-navy-800">{t('helpTitle')}</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{t('helpBody')}</p>
            </div>
          </div>

          <p className="mt-auto flex items-center justify-center gap-1.5 pt-8 text-center text-xs text-slate-400">
            <Lock className="h-3 w-3" /> {t('session')} · © {new Date().getFullYear()} Emergent Cold LatAm
          </p>
        </div>

        {/* Painel direito — arte da marca (foto do armazém) */}
        <div className="relative hidden flex-col justify-between overflow-hidden bg-navy-900 px-10 py-12 text-white md:flex">
          <img src="/login-bg.jpg" alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover object-center" />
          <div aria-hidden className="absolute inset-0 bg-navy-900/45" />
          <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-navy-900/90 via-navy-900/70 to-navy-900/95" />

          <div className="relative flex items-center gap-2.5">
            <Snowflake className="h-5 w-5 text-white/80" />
            <img src="/logo-white.webp" alt="Emergent Cold LatAm" className="h-9 w-auto" />
          </div>

          <div className="relative max-w-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">{t('tagline')}</p>
            <h2 className="mt-4 text-[1.7rem] font-semibold leading-tight">{t('headline')}</h2>
            <div className="mt-8 space-y-3">
              <Feature label="OPEX/CAPEX" text={t('featBudget')} />
              <Feature label={t('featScopeLabel')} text={t('featScope')} />
              <Feature label="Rateio" text={t('featRateio')} />
            </div>
          </div>

          <p className="relative text-xs text-white/50">emergentcoldlatam.com</p>
        </div>

      </div>
    </div>
  )
}

/* Barra de feature do painel de arte */
function Feature({ label, text }: { label: string; text: string }) {
  return (
    <div className="flex items-center gap-4 rounded-xl bg-white/10 px-4 py-3 ring-1 ring-white/15 backdrop-blur-sm">
      <span className="w-24 shrink-0 text-sm font-semibold text-white">{label}</span>
      <span className="text-sm leading-snug text-white/80">{text}</span>
    </div>
  )
}
