import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import Layout from '@/components/Layout'
import { BarChart2, Warehouse, FileSignature, ArrowRight, LineChart, Table2, Wallet } from 'lucide-react'

type Card = { href: string; title: string; desc: string; icon: any; tag?: string; disabled?: boolean }

export default function ReportHubPage() {
  const user = getCurrentUser()
  if (!user) redirect('/login')
  const admin = user.role === 'admin'

  const cards: Card[] = [
    { href: '/report/analise', icon: BarChart2, title: 'Análise de Budget',
      desc: 'Gráficos por categoria, Pareto de fornecedores, YoY, OPEX/CAPEX, orçado × realizado e curva S.' },
    ...(admin ? [
      { href: '/report/despesa-unidade', icon: Warehouse, title: 'Despesa por Unidade',
        desc: 'Quanto cada unidade custou de TI — orçado × realizado, separando direto de rateado. Export CSV.' },
      { href: '/report/contratos', icon: FileSignature, title: 'Vigência de Contratos',
        desc: 'Contratos vigentes, vencendo e vencidos, com alertas de renovação e export CSV.' },
      { href: '/report/servicos', icon: Table2, title: 'Contrato × Orçado × Realizado',
        desc: 'Correlação por serviço (fornecedor + categoria + unidade): contratado, orçado e realizado lado a lado, com desvio. Export CSV.' },
      { href: '/report/forecast', icon: LineChart, title: 'Forecast FY',
        desc: 'Projeção de fechamento do ano por unidade: realizado dos meses fechados + budget restante.' },
      { href: '/report/disponivel', icon: Wallet, title: 'Comprometido / Disponível',
        desc: 'Orçado − Realizado − Comprometido (contratos dos meses em aberto) = quanto ainda há para gastar.' },
    ] as Card[] : []),
    { href: '#', icon: Table2, title: 'Detalhe (linha a linha)', tag: 'Em breve', disabled: true,
      desc: 'Lançamentos de budget e realizado por CC × categoria × fornecedor × mês, com export.' },
  ]

  return (
    <Layout user={user}>
      <div className="page">
        <div className="mb-6">
          <h1 className="page-title flex items-center gap-2">
            <BarChart2 className="w-5 h-5 text-blue-600" /> Relatórios
          </h1>
          <p className="text-sm text-slate-500">Escolha um relatório.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {cards.map(c => {
            const inner = (
              <>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                    <c.icon className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="font-semibold text-slate-800">{c.title}</h2>
                      {c.tag && <span className="text-[10px] uppercase tracking-wide bg-slate-100 text-slate-500 rounded-full px-2 py-0.5">{c.tag}</span>}
                    </div>
                    <p className="text-sm text-slate-500 mt-1 leading-snug">{c.desc}</p>
                  </div>
                </div>
                {!c.disabled && (
                  <div className="mt-3 text-sm text-blue-600 font-medium flex items-center gap-1 justify-end">
                    Abrir <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                )}
              </>
            )
            return c.disabled ? (
              <div key={c.title} className="card p-4 opacity-60 cursor-default">{inner}</div>
            ) : (
              <Link key={c.title} href={c.href}
                className="card p-4 hover:border-blue-200 hover:shadow-md transition-all">{inner}</Link>
            )
          })}
        </div>
      </div>
    </Layout>
  )
}
