import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import pool from '@/lib/db'
import Layout from '@/components/Layout'
import UnidadesClient from './UnidadesClient'

export default async function Page() {
  const user = getCurrentUser()
  if (!user) redirect('/login')
  if (user.role !== 'admin') redirect('/')
  const [countries, costCenters] = await Promise.all([
    pool.query('SELECT id, code, name FROM public.countries WHERE is_active=true ORDER BY name'),
    pool.query('SELECT id, code, name FROM public.units WHERE is_active=true ORDER BY code'),
  ])
  return (
    <Layout user={user}>
      <UnidadesClient countries={countries.rows} costCenters={costCenters.rows} />
    </Layout>
  )
}
