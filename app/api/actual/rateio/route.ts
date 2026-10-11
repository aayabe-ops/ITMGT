import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { applyRateioActual } from '@/lib/rateioEngine'

// Botão "Rateio" do Realizado — agora usa o motor F05 (driver_id + unidades participantes
// + memória), em vez da antiga função execute_rateio (bug type='OP').
export async function POST(req: NextRequest) {
  const user = getCurrentUser()
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const { year, month } = await req.json()
  try {
    const r = await applyRateioActual(parseInt(year), parseInt(month))
    if (r.closed) return NextResponse.json({ error: 'Período fechado — reabra para reprocessar.' }, { status: 409 })
    return NextResponse.json({ ok: true, ...r })
  } catch (e: any) { return NextResponse.json({ error: e?.message || 'Erro ao aplicar rateio.' }, { status: 500 }) }
}
