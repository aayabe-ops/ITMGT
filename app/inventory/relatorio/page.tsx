import { getCurrentUser, canManageInventory, isGlobalReader } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Layout from '@/components/Layout'
import ReportInvClient from './ReportInvClient'

export const dynamic = 'force-dynamic'

export default function Page() {
  const user = getCurrentUser()
  if (!user) redirect('/login')
  if (!canManageInventory(user) && !isGlobalReader(user)) redirect('/')
  return (
    <Layout user={user}>
      <ReportInvClient defaultYear={new Date().getFullYear()} />
    </Layout>
  )
}
