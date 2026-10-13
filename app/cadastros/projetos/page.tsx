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
      <LookupCrud endpoint="/api/projects" title="Projetos" subtitle="Códigos de projeto"
        teach={{ what: 'projetos', example: 'Um projeto agrupa despesas de uma iniciativa específica (opcional). Ex.: Migração SAP, Rollout Wi-Fi.' }} />
    </Layout>
  )
}
