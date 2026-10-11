import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Layout from '@/components/Layout'
import ProntidaoClient from './ProntidaoClient'

export default function ProntidaoPage() {
  const user = getCurrentUser()
  if (!user) redirect('/login')
  if (user.role !== 'admin') redirect('/')
  return (
    <Layout user={user}>
      <ProntidaoClient />
    </Layout>
  )
}
