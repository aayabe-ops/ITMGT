import { getCurrentUser, canLancar } from '@/lib/auth'
import { redirect } from 'next/navigation'
import pool from '@/lib/db'
import Layout from '@/components/Layout'
import ImportActualClient from './ImportActualClient'

export default async function Page() {
  const user = getCurrentUser()
  if (!user) redirect('/login')
  if (!canLancar(user)) redirect('/')

  const [countries, units, categories, suppliers, projects, services] = await Promise.all([
    pool.query('SELECT id, code, name FROM public.countries WHERE is_active=true ORDER BY name'),
    pool.query('SELECT u.id, u.code, u.name, u.country_id, u.unidade_id, ud.name AS unidade_nome FROM public.units u LEFT JOIN public.unidades ud ON ud.id = u.unidade_id WHERE u.is_active=true ORDER BY u.code'),
    pool.query('SELECT id, code, name FROM public.categories WHERE is_active=true ORDER BY name'),
    pool.query('SELECT id, name, short_name FROM public.suppliers WHERE is_active=true ORDER BY name'),
    pool.query('SELECT id, code, name FROM public.projects WHERE is_active=true ORDER BY name'),
    pool.query('SELECT supplier_id, category_id, cost_class::text AS cost_class, unit_id FROM public.contracts WHERE is_active=true'),
  ])

  return (
    <Layout user={user}>
      <ImportActualClient
        countries={countries.rows} units={units.rows} categories={categories.rows}
        suppliers={suppliers.rows} projects={projects.rows} services={services.rows} />
    </Layout>
  )
}
