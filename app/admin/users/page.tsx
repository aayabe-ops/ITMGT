import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import pool from '@/lib/db'
import Layout from '@/components/Layout'
import UsersClient from './UsersClient'

export default async function AdminUsersPage() {
  const user = getCurrentUser()
  if (!user) redirect('/login')
  if (user.role !== 'admin') redirect('/')

  const [platforms, countries, units] = await Promise.all([
    pool.query('SELECT id, code, name FROM public.platforms WHERE is_active=true ORDER BY name'),
    pool.query('SELECT id, code, name, platform_id FROM public.countries WHERE is_active=true ORDER BY name'),
    pool.query('SELECT id, code, name, country_id FROM public.units WHERE is_active=true ORDER BY code'),
  ])

  return (
    <Layout user={user}>
      <UsersClient platforms={platforms.rows} countries={countries.rows} units={units.rows} />
    </Layout>
  )
}
