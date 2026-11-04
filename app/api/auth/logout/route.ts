import { NextResponse } from 'next/server'
import { COOKIE, getCurrentUser } from '@/lib/auth'
import { audit } from '@/lib/audit'

export async function POST() {
  const u = getCurrentUser()
  if (u) await audit({ user_id: u.id, user_email: u.email, action: 'LOGOUT' })
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE, '', { maxAge: 0, path: '/' })
  return res
}
