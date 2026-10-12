import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser, canManageSupply } from '@/lib/auth'
import pool from '@/lib/db'

export async function POST(req: NextRequest) {
  const user = getCurrentUser()
  if (!canManageSupply(user)) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 })

  await pool.query('UPDATE public.rateio_criteria SET is_active = NOT is_active WHERE id=$1', [id])
  return NextResponse.json({ ok: true })
}
