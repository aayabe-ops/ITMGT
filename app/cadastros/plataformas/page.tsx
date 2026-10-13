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
      <LookupCrud endpoint="/api/platforms" title="Plataformas" subtitle="Nível mais alto da hierarquia (3 plataformas)"
        teach={{ what: 'plataformas', example: 'A plataforma é o nível mais alto da estrutura — a regional da empresa. Ex.: Emergent Cold Brasil.' }} />
    </Layout>
  )
}
