import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import pool from '@/lib/db'
import { signToken, COOKIE } from '@/lib/auth'
import { audit } from '@/lib/audit'

export async function POST(req: NextRequest) {
  const { email, password } = await req.json()

  if (!email || !password) {
    return NextResponse.json({ error: 'E-mail e senha obrigatórios' }, { status: 400 })
  }

  const { rows } = await pool.query(
    'SELECT id, email, password_hash, full_name, role, unit_id, lang FROM public.users WHERE email = $1 AND is_active = true',
    [email.toLowerCase().trim()]
  )

  const user = rows[0]
  if (!user) {
    await audit({ user_email: String(email).toLowerCase().trim(), action: 'LOGIN_FAIL', detail: 'usuário inexistente ou inativo' })
    return NextResponse.json({ error: 'E-mail ou senha inválidos' }, { status: 401 })
  }

  const valid = await bcrypt.compare(password, user.password_hash)
  if (!valid) {
    await audit({ user_id: user.id, user_email: user.email, action: 'LOGIN_FAIL', detail: 'senha inválida' })
    return NextResponse.json({ error: 'E-mail ou senha inválidos' }, { status: 401 })
  }

  await audit({ user_id: user.id, user_email: user.email, action: 'LOGIN_OK' })

  const token = signToken({
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    role: user.role,
    unit_id: user.unit_id,
  })

  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 8, // 8 horas
  })
  // idioma preferido do usuário → cookie lido pelo next-intl
  res.cookies.set('LOCALE', ['pt', 'es', 'en'].includes(user.lang) ? user.lang : 'pt', {
    sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365,
  })
  return res
}
