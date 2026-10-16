import { getCurrentUser, canManageSupply } from '@/lib/auth'
import { redirect } from 'next/navigation'
import pool from '@/lib/db'
import Layout from '@/components/Layout'
import RateioClient from './RateioClient'

export default async function RateioPage() {
  const user = getCurrentUser()
  if (!user) redirect('/login')
  if (!canManageSupply(user)) redirect('/')

  const [categories, suppliers, units, drivers, contracts, countries] = await Promise.all([
    pool.query('SELECT id, code, name FROM public.categories WHERE is_active=true ORDER BY name'),
    pool.query('SELECT id, name, short_name FROM public.suppliers WHERE is_active=true ORDER BY name'),
    pool.query(`SELECT u.id, u.code, u.name, u.country_id, u.unidade_id, ud.name AS unidade_nome
                  FROM public.units u LEFT JOIN public.unidades ud ON ud.id = u.unidade_id
                 WHERE u.is_active=true ORDER BY ud.name NULLS LAST, u.code`),
    pool.query(`SELECT id, code, name, kind, metric, unit_label FROM public.allocation_drivers WHERE is_active=true
                 ORDER BY (kind='EQUAL') DESC, (kind='MANUAL'), name`),
    pool.query('SELECT id, code, name, supplier_id, category_id, monthly_value FROM public.contracts WHERE is_active=true ORDER BY name'),
    pool.query('SELECT id, code, name FROM public.countries WHERE is_active=true ORDER BY name'),
  ])

  return (
    <Layout user={user}>
      <RateioClient
        categories={categories.rows} suppliers={suppliers.rows} units={units.rows}
        drivers={drivers.rows} contracts={contracts.rows} countries={countries.rows} />
    </Layout>
  )
}
