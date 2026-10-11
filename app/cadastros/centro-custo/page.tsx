import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import pool from '@/lib/db'
import Layout from '@/components/Layout'
import CostCenterClient from './CostCenterClient'

export default async function Page() {
  const user = getCurrentUser()
  if (!user) redirect('/login')
  if (user.role !== 'admin') redirect('/')

  const [companies, countries, unidades] = await Promise.all([
    pool.query('SELECT id, code, name FROM public.companies WHERE is_active=true ORDER BY code'),
    pool.query('SELECT id, code, name FROM public.countries WHERE is_active=true ORDER BY name'),
    pool.query('SELECT id, code, name FROM public.unidades WHERE is_active=true ORDER BY code'),
  ])

  return (
    <Layout user={user}>
      <CostCenterClient companies={companies.rows} countries={countries.rows} unidades={unidades.rows} />
    </Layout>
  )
}
