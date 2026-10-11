import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import pool from '@/lib/db'
import Layout from '@/components/Layout'
import DespesaClient from './DespesaClient'

export default async function Page() {
  const user = getCurrentUser()
  if (!user) redirect('/login')
  if (user.role !== 'admin') redirect('/')

  const [suppliers, unidades, units] = await Promise.all([
    pool.query('SELECT id, COALESCE(short_name, name) AS name FROM public.suppliers WHERE is_active=true ORDER BY name'),
    pool.query('SELECT id, code, name FROM public.unidades WHERE is_active=true ORDER BY code'),
    pool.query('SELECT id, code, name, unidade_id FROM public.units WHERE is_active=true ORDER BY code'),
  ])

  return (
    <Layout user={user}>
      <DespesaClient suppliers={suppliers.rows} unidades={unidades.rows} units={units.rows} />
    </Layout>
  )
}
