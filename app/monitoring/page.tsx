import { getCurrentUser, isGlobalReader } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Layout from '@/components/Layout'
import MonitoringClient from './MonitoringClient'

export const dynamic = 'force-dynamic'

export default function Page() {
  const user = getCurrentUser()
  if (!user) redirect('/login')
  if (!isGlobalReader(user)) redirect('/')
  return (
    <Layout user={user}>
      <MonitoringClient />
    </Layout>
  )
}
