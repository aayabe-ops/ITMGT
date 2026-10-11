import jwt from 'jsonwebtoken'
import { cookies } from 'next/headers'

const SECRET = process.env.JWT_SECRET || 'itcost-secret-key-mude-em-producao'
const COOKIE = 'itcost_token'

export interface AuthUser {
  id: string
  email: string
  full_name: string | null
  role: 'admin' | 'lancador' | 'unit_viewer' | 'multi_country' | string
  unit_id: string | null
}

// Permissão de LANÇAR realizado (Ordem de pagamento): admin ou lançador.
// Budget, Fechamento, Rateio, Cadastros e Usuários continuam SÓ admin.
export const canLancar = (u?: { role?: string } | null): boolean =>
  !!u && (u.role === 'admin' || u.role === 'lancador')

export function signToken(user: AuthUser): string {
  return jwt.sign(user, SECRET, { expiresIn: '8h' })
}

export function verifyToken(token: string): AuthUser | null {
  try {
    return jwt.verify(token, SECRET) as AuthUser
  } catch {
    return null
  }
}

export function getCurrentUser(): AuthUser | null {
  try {
    const cookieStore = cookies()
    const token = cookieStore.get(COOKIE)?.value
    if (!token) return null
    return verifyToken(token)
  } catch {
    return null
  }
}

export { COOKIE }
