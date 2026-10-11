import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Layout from '@/components/Layout'
import ContratosVigenciaClient from './ContratosVigenciaClient'

export default function Page() {
  const user = getCurrentUser()
  if (!user) redirect('/login')
  return (
    <Layout user={user}>
      <ContratosVigenciaClient />
    </Layout>
  )
}
