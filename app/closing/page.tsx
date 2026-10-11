import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import pool from '@/lib/db'
import Layout from '@/components/Layout'
import ClosingClient from './ClosingClient'

export default async function Page() {
  const user = getCurrentUser()
  if (!user) redirect('/login')
  if (user.role !== 'admin') redirect('/')
  const { rows: units } = await pool.query('SELECT u.id, u.code, u.name, ud.name AS unidade_nome FROM public.units u LEFT JOIN public.unidades ud ON ud.id = u.unidade_id WHERE u.is_active=true ORDER BY u.code')
  return (
    <Layout user={user}>
      <ClosingClient user={user} units={units} />
    </Layout>
  )
}
