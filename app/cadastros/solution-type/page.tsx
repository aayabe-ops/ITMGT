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
      <LookupCrud endpoint="/api/solution-types" title="Solution Type" subtitle="Tipo de solução de TI"
        teach={{ what: 'áreas de TI (Solution Type)', example: 'A área de TI de um serviço. Ex.: Redes, Segurança, ERP, Service Desk.' }} />
    </Layout>
  )
}
