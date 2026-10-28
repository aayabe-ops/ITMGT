import jwt from 'jsonwebtoken'
import { cookies } from 'next/headers'

const SECRET = process.env.JWT_SECRET || 'itcost-secret-key-mude-em-producao'
const COOKIE = 'itcost_token'

export interface AuthUser {
  id: string
  email: string
  full_name: string | null
  role: 'admin' | 'lancador' | 'diretor' | 'gerente' | 'analista' | 'unit_viewer' | 'multi_country' | string
  unit_id: string | null
}

// Capacidades por papel (poder cresce de cima para baixo; estrutura e usuários = só admin):
//  - LANÇAR realizado (Ordem de pagamento): admin, lançador, analista, gerente.
//  - FORNECIMENTO (cadastrar fornecedor/contrato + regras de rateio): admin, analista, gerente.
//  - BUDGET (carregar orçamento) e FECHAMENTO: admin, gerente.
export const canLancar = (u?: { role?: string } | null): boolean =>
  !!u && (u.role === 'admin' || u.role === 'lancador' || u.role === 'analista' || u.role === 'gerente')
export const canManageSupply = (u?: { role?: string } | null): boolean =>
  !!u && (u.role === 'admin' || u.role === 'analista' || u.role === 'gerente')
export const canManageBudget = (u?: { role?: string } | null): boolean =>
  !!u && (u.role === 'admin' || u.role === 'gerente')

// INVENTÁRIO TI (cadastrar/editar/excluir ativos e licenças): mesmos papéis do
// fornecimento (admin/analista/gerente), limitados pelo escopo geográfico (lib/scope).
export const canManageInventory = (u?: { role?: string } | null): boolean =>
  canManageSupply(u)

// Diretor = leitura GLOBAL (todos os países), sem escrever nada.
// Vê dashboard e TODOS os relatórios executivos (Forecast, Disponível, etc.).
export const canSeeReports = (u?: { role?: string } | null): boolean =>
  !!u && (u.role === 'admin' || u.role === 'diretor')
// Leitor global (sem imposição de escopo por país/unidade): admin ou diretor.
export const isGlobalReader = (u?: { role?: string } | null): boolean =>
  !!u && (u.role === 'admin' || u.role === 'diretor')

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
