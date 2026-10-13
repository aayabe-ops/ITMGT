import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Layout from '@/components/Layout'
import LookupCrud from '@/components/LookupCrud'

export default function Page() {
  const user = getCurrentUser()
  if (!user) redirect('/login')
  if (user.role !== 'admin') redirect('/')
  return (
    <Layout user={user}>
      <LookupCrud endpoint="/api/supplier-types" title="Grupo" subtitle="Grupo (nível 1) da taxonomia de TI — agrupa as Categorias (e classifica fornecedores)"
        teach={{ what: 'grupos (tipos de fornecedor)', example: 'O grupo é o nível acima da categoria na taxonomia de TI. Ex.: Infra & Cloud, Aplicações & Software, Telecom.' }} />
    </Layout>
  )
}
