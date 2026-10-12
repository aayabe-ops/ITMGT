import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser, canManageSupply } from '@/lib/auth'
import { applyRateioActual, applyRateioBudget } from '@/lib/rateioEngine'

// Aplica rateio: scenario = 'ACTUAL' (Realizado do mês), 'BUDGET' (budget do ano) ou 'BOTH'.
export async function POST(req: NextRequest) {
  const user = getCurrentUser(); if (!canManageSupply(user)) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const b: any = await req.json().catch(() => ({}))
  const year = parseInt(b.year), month = parseInt(b.month)
  const scenario = b.scenario === 'BUDGET' ? 'BUDGET' : b.scenario === 'BOTH' ? 'BOTH' : 'ACTUAL'
  if (!(year > 0)) return NextResponse.json({ error: 'Ano inválido.' }, { status: 400 })

  try {
    const out: any = { scenario }
    if (scenario === 'ACTUAL' || scenario === 'BOTH') {
      if (!(month >= 1 && month <= 12)) return NextResponse.json({ error: 'Mês inválido para o Realizado.' }, { status: 400 })
      const r = await applyRateioActual(year, month)
      if (r.closed) return NextResponse.json({ error: 'Período fechado — reabra para reprocessar.' }, { status: 409 })
      out.actual = r
    }
    if (scenario === 'BUDGET' || scenario === 'BOTH') {
      out.budget = await applyRateioBudget(year, user.id)
    }
    return NextResponse.json(out)
  } catch (e: any) { return NextResponse.json({ error: e?.message || 'Erro ao aplicar rateio.' }, { status: 500 }) }
}
