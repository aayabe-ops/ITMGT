import { NextResponse, type NextRequest } from 'next/server'
import { COOKIE } from '@/lib/auth'

function decodeJWT(token: string): { exp?: number; role?: string } | null {
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    const data = JSON.parse(json)
    if (data.exp && data.exp < Date.now() / 1000) return null
    return data
  } catch {
    return null
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const token = request.cookies.get(COOKIE)?.value
  const isLogin = pathname === '/login'
  const isApi   = pathname.startsWith('/api/')

  if (isApi) return NextResponse.next()
  // Arquivos estáticos da pasta public (imagens/assets) passam sem autenticação,
  // para que o fundo e o logo do login carreguem mesmo sem sessão.
  if (/\.[a-zA-Z0-9]+$/.test(pathname)) return NextResponse.next()

  const user = token ? decodeJWT(token) : null

  if (!user && !isLogin) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
  if (user && isLogin) {
    return NextResponse.redirect(new URL('/', request.url))
  }
  return NextResponse.next()
}

export const config = {
  // Exclui _next e os arquivos estáticos da pasta public (imagens/assets) para que
  // o fundo e o logo do login carreguem mesmo sem sessão.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|txt|woff|woff2|ttf|map)).*)'],
}
