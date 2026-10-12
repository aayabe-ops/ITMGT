'use client'
import { useState, useEffect, Fragment } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { AuthUser } from '@/lib/auth'
import { Unit } from '@/lib/types'
import { LayoutDashboard, Upload, FileText, Settings2, Users, LogOut, Menu, Building2, BarChart2, Truck, Tags, Boxes, FolderKanban, Layers, Globe, ClipboardCheck, Cpu, Share2, Building, CircleDollarSign, ArrowLeftRight, Wallet, ChevronDown, FileSignature, Warehouse, Receipt, Gauge, LineChart } from 'lucide-react'
import clsx from 'clsx'
import { useTranslations } from 'next-intl'
import LangSwitcher from '@/components/LangSwitcher'

type NavLink = { href: string; key: string; icon: any }
type NavGroup = { key: string; items: NavLink[]; section?: 'config' }

interface Props {
  user: AuthUser
  unit?: { code: string; name: string } | null
  children: React.ReactNode
}

export default function Layout({ user, unit, children }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [hover, setHover] = useState(false)   // desktop: expande o rail no hover
  const wide = hover || open                  // largo quando: hover (desktop) ou aberto (mobile)

  const t = useTranslations('nav')
  const adminGroups: NavGroup[] = [
    // ── OPERAÇÃO (uso diário, topo) ──
    { key: 'operacao', items: [
      { href: '/',              key: 'dashboard', icon: LayoutDashboard },
      { href: '/budget/upload', key: 'budget',    icon: Upload },
      { href: '/actual',        key: 'actual',    icon: FileText },
      { href: '/closing',       key: 'closing',   icon: ClipboardCheck },
      { href: '/rateio',        key: 'rateio',    icon: Settings2 },
    ] },
    // ── RELATÓRIOS ──
    { key: 'relatorios', items: [
      { href: '/report',                 key: 'reportHub',       icon: BarChart2 },
      { href: '/report/analise',         key: 'report',          icon: LineChart },
      { href: '/report/despesa-unidade', key: 'reportUnit',      icon: Warehouse },
      { href: '/report/contratos',       key: 'reportContracts', icon: FileSignature },
    ] },
    // ── CONFIGURAÇÕES (isolada no rodapé) — 4 grupos por tarefa + Saúde do cadastro (home).
    // Ordem dentro de cada grupo = ordem de preenchimento (dependências).
    { key: 'visao', section: 'config', items: [
      { href: '/prontidao', key: 'readiness', icon: Gauge },
    ] },
    { key: 'estrutura', section: 'config', items: [
      { href: '/cadastros/moedas',       key: 'currencies',  icon: CircleDollarSign },
      { href: '/cadastros/plataformas',  key: 'platforms',   icon: Layers },
      { href: '/cadastros/paises',       key: 'countries',   icon: Globe },
      { href: '/cadastros/cambio',       key: 'exchange',    icon: ArrowLeftRight },
      { href: '/cadastros/empresas',     key: 'companies',   icon: Building },
      { href: '/cadastros/unidades',     key: 'units',       icon: Warehouse },
      { href: '/cadastros/centro-custo', key: 'costCenters', icon: Wallet },
    ] },
    { key: 'classificacoes', section: 'config', items: [
      { href: '/cadastros/categorias',    key: 'categories',    icon: Tags },
      { href: '/cadastros/tipos',         key: 'supplierTypes', icon: Boxes },
      { href: '/cadastros/solution-type', key: 'solutionTypes', icon: Cpu },
      { href: '/cadastros/projetos',      key: 'projects',      icon: FolderKanban },
      { href: '/cadastros/alocacao',      key: 'allocations',   icon: Share2 },
    ] },
    { key: 'fornecimento', section: 'config', items: [
      { href: '/cadastros/fornecedores', key: 'suppliers', icon: Truck },
      { href: '/cadastros/contratos',    key: 'contracts', icon: FileSignature },
    ] },
    { key: 'acesso', section: 'config', items: [
      { href: '/admin/users', key: 'users', icon: Users },
    ] },
  ]
  // Diretor: leitura global — dashboard + todos os relatórios (sem operação nem configuração).
  const diretorGroups: NavGroup[] = [
    { key: 'operacao', items: [
      { href: '/', key: 'dashboard', icon: LayoutDashboard },
    ] },
    { key: 'relatorios', items: [
      { href: '/report',                 key: 'reportHub',       icon: BarChart2 },
      { href: '/report/analise',         key: 'report',          icon: LineChart },
      { href: '/report/despesa-unidade', key: 'reportUnit',      icon: Warehouse },
      { href: '/report/contratos',       key: 'reportContracts', icon: FileSignature },
    ] },
  ]
  // Lançador: só o que opera (dashboard + Ordem de pagamento).
  const lancadorGroups: NavGroup[] = [
    { key: 'operacao', items: [
      { href: '/',       key: 'dashboard', icon: LayoutDashboard },
      { href: '/actual', key: 'actual',    icon: FileText },
    ] },
  ]
  // Viewer País / Multi-País: leitura no seu escopo.
  const viewerGroups: NavGroup[] = [
    { key: 'operacao', items: [
      { href: '/',       key: 'dashboard', icon: LayoutDashboard },
      { href: '/actual', key: 'actual',    icon: FileText },
    ] },
  ]
  // Menu adapta ao papel — mostra só o que o perfil pode abrir (esconder, não expulsar).
  const groups = user.role === 'admin' ? adminGroups
    : user.role === 'diretor' ? diretorGroups
    : user.role === 'lancador' ? lancadorGroups
    : viewerGroups

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  useEffect(() => {
    try { const s = localStorage.getItem('nav_collapsed'); if (s) setCollapsed(JSON.parse(s)) } catch {}
  }, [])
  const toggleGroup = (k: string) => setCollapsed(prev => {
    const next = { ...prev, [k]: !prev[k] }
    try { localStorage.setItem('nav_collapsed', JSON.stringify(next)) } catch {}
    return next
  })

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  const Sidebar = () => (
    <aside onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      className={clsx(
      'fixed inset-y-0 left-0 z-40 w-60 bg-navy-800 flex flex-col transition-[width,transform] duration-200 shadow-xl',
      hover ? 'md:w-60' : 'md:w-16',
      open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
    )}>
      <div className={clsx('border-b border-navy-700 overflow-hidden', wide ? 'px-4 py-5' : 'px-2 py-5 flex justify-center')}>
        {wide ? (
          <>
            <img src="/logo-white.webp" alt="Emergent Cold LatAm" className="h-10 w-auto" />
            <p className="text-[10px] uppercase tracking-wider text-slate-400 mt-1.5">IT Cost Manager</p>
            {unit && (
              <div className="flex items-center gap-1 mt-1.5 text-xs text-slate-400">
                <Building2 className="w-3 h-3" />
                {unit.code} — {unit.name}
              </div>
            )}
          </>
        ) : (
          <div className="h-9 w-9 rounded-lg bg-white/10 flex items-center justify-center text-white font-bold text-xs tracking-tight">EC</div>
        )}
      </div>
      <nav className="nav-scroll flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        <style>{`
          .nav-scroll { scrollbar-width: thin; scrollbar-color: #334155 transparent; }
          .nav-scroll::-webkit-scrollbar { width: 6px; }
          .nav-scroll::-webkit-scrollbar-track { background: transparent; }
          .nav-scroll::-webkit-scrollbar-thumb { background: #334155; border-radius: 9999px; }
          .nav-scroll:hover::-webkit-scrollbar-thumb { background: #475569; }
        `}</style>
        {(() => {
          const firstConfigIdx = groups.findIndex(g => g.section === 'config')
          return groups.map((g, gi) => {
          const hasActive = g.items.some(it => it.href === pathname)
          const isCol = wide && !!collapsed[g.key] && !hasActive // colapso de grupo só quando expandido
          return (
            <Fragment key={g.key}>
              {gi === firstConfigIdx && (
                wide
                  ? <div className="mt-4 mb-1 border-t border-navy-700/70 px-3 pt-3"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{t('configSection')}</span></div>
                  : <div className="my-2 mx-2 border-t border-navy-700/70" />
              )}
              <div className="mb-1">
                {wide && (
                  <button type="button" onClick={() => toggleGroup(g.key)}
                    className={clsx('w-full flex items-center justify-between px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider transition-colors',
                      hasActive ? 'text-slate-200' : 'text-slate-500 hover:text-slate-300')}>
                    <span>{t(g.key)}</span>
                    <ChevronDown className={clsx('w-3.5 h-3.5 transition-transform duration-200', isCol && '-rotate-90')} />
                  </button>
                )}
                {!isCol && (
                  <div className="space-y-0.5">
                    {g.items.map(item => (
                      <Link key={item.href} href={item.href} onClick={() => setOpen(false)} title={!wide ? t(item.key) : undefined}
                        className={clsx(
                          'relative flex items-center gap-2.5 rounded-lg text-sm transition-colors',
                          wide ? 'px-3 py-2' : 'px-0 py-2 justify-center',
                          pathname === item.href
                            ? 'bg-bordeaux text-white font-semibold shadow-sm before:absolute before:-left-2 before:top-1.5 before:bottom-1.5 before:w-1 before:rounded-r-full before:bg-white/90'
                            : 'text-slate-300/90 hover:bg-white/5 hover:text-white'
                        )}>
                        <item.icon className="w-4 h-4 shrink-0" />
                        {wide && <span className="truncate">{t(item.key)}</span>}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </Fragment>
          )
          })
        })()}
      </nav>
      <div className="px-2 py-3 border-t border-navy-700">
        {wide && <div className="px-3 pb-2 flex justify-center"><LangSwitcher /></div>}
        {wide && <div className="px-3 py-2 text-xs text-slate-500 truncate">{user.full_name || user.email}</div>}
        <button onClick={logout} title={!wide ? t('logout') : undefined}
          className={clsx('w-full flex items-center gap-2.5 py-2 rounded-lg text-sm text-slate-300 hover:bg-navy-700 hover:text-white transition-colors', wide ? 'px-3' : 'px-0 justify-center')}>
          <LogOut className="w-4 h-4 shrink-0" /> {wide && t('logout')}
        </button>
      </div>
    </aside>
  )

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar />
      {open && <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={() => setOpen(false)} />}
      <div className="md:pl-16">
        <header className="sticky top-0 z-20 flex items-center gap-3 bg-white border-b border-slate-100 px-4 py-3 md:hidden">
          <button onClick={() => setOpen(true)} className="p-1 rounded-lg hover:bg-slate-100">
            <Menu className="w-5 h-5" />
          </button>
          <span className="text-sm font-semibold text-slate-800">IT Cost Manager</span>
        </header>
        <main>{children}</main>
      </div>
    </div>
  )
}
