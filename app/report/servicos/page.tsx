import { getCurrentUser, canSeeReports } from '@/lib/auth'
import { redirect } from 'next/navigation'
import pool from '@/lib/db'
import Layout from '@/components/Layout'
import ServicosClient from './ServicosClient'

export default async function Page() {
  const user = getCurrentUser()
  if (!user) redirect('/login')
  if (!canSeeReports(user)) redirect('/report')
  const [countries, unidades] = await Promise.all([
    pool.query('SELECT id, name FROM public.countries WHERE is_active=true ORDER BY name'),
    pool.query('SELECT id, name FROM public.unidades WHERE is_active=true ORDER BY name'),
  ])
  return (
    <Layout user={user}>
      <ServicosClient countries={countries.rows} unidades={unidades.rows} />
    </Layout>
  )
}
