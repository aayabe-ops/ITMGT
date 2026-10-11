import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import pool from '@/lib/db'
import Layout from '@/components/Layout'
import ExchangeClient from './ExchangeClient'

export default async function Page() {
  const user = getCurrentUser()
  if (!user) redirect('/login')
  if (user.role !== 'admin') redirect('/')
  const { rows: currencies } = await pool.query('SELECT id, code, name FROM public.currencies WHERE is_active=true ORDER BY code')
  return (
    <Layout user={user}>
      <ExchangeClient currencies={currencies} />
    </Layout>
  )
}
