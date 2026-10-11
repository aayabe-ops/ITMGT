import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import pool from '@/lib/db'
import Layout from '@/components/Layout'
import ContractsClient from './ContractsClient'

export default async function Page() {
  const user = getCurrentUser()
  if (!user) redirect('/login')
  if (user.role !== 'admin') redirect('/')

  const [suppliers, units, categories, costCenters, currencies] = await Promise.all([
    pool.query('SELECT id, COALESCE(short_name, name) AS name FROM public.suppliers WHERE is_active=true ORDER BY name'),
    pool.query('SELECT id, code, name FROM public.units WHERE is_active=true ORDER BY code'),
    pool.query('SELECT id, name FROM public.categories WHERE is_active=true ORDER BY name'),
    pool.query('SELECT id, code, name FROM public.cost_centers WHERE is_active=true ORDER BY name'),
    pool.query('SELECT id, code, name FROM public.currencies WHERE is_active=true ORDER BY code'),
  ])

  return (
    <Layout user={user}>
      <ContractsClient suppliers={suppliers.rows} units={units.rows} categories={categories.rows}
        costCenters={costCenters.rows} currencies={currencies.rows} />
    </Layout>
  )
}
