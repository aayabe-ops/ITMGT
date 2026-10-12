import { getCurrentUser, canSeeReports } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Layout from '@/components/Layout'
import DisponivelClient from './DisponivelClient'

export default function Page() {
  const user = getCurrentUser()
  if (!user) redirect('/login')
  if (!canSeeReports(user)) redirect('/report')
  return (<Layout user={user}><DisponivelClient /></Layout>)
}
