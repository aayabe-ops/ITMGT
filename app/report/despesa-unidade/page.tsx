import { getCurrentUser, canSeeReports } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Layout from '@/components/Layout'
import DespesaUnidadeClient from './DespesaUnidadeClient'

export default function Page() {
  const user = getCurrentUser()
  if (!user) redirect('/login')
  if (!canSeeReports(user)) redirect('/report')
  return (
    <Layout user={user}>
      <DespesaUnidadeClient />
    </Layout>
  )
}
