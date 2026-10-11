import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import pool from '@/lib/db'

export async function POST(req: NextRequest) {
  const u = getCurrentUser()
  if (!u) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const { lang } = await req.json().catch(() => ({}))
  if (!['pt', 'es', 'en'].includes(lang)) return NextResponse.json({ error: 'Idioma inválido' }, { status: 400 })
  try { await pool.query('UPDATE public.users SET lang=$1 WHERE id=$2', [lang, u.id]) } catch {}
  const res = NextResponse.json({ ok: true })
  res.cookies.set('LOCALE', lang, { sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365 })
  return res
}
