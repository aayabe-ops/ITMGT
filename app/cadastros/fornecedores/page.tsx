import { getCurrentUser, canManageSupply } from '@/lib/auth'
import { redirect } from 'next/navigation'
import pool from '@/lib/db'
import Layout from '@/components/Layout'
import SuppliersClient from './SuppliersClient'

export default async function Page() {
  const user = getCurrentUser()
  if (!user) redirect('/login')
  if (!canManageSupply(user)) redirect('/')

  const [types, cats, projs, units, countries, gaGroups, costCenters, solutionTypes, currencies] = await Promise.all([
    pool.query('SELECT id, name FROM public.supplier_types WHERE is_active=true ORDER BY name'),
    pool.query('SELECT id, name FROM public.categories WHERE is_active=true ORDER BY name'),
    pool.query('SELECT id, code, name FROM public.projects WHERE is_active=true ORDER BY name'),
    pool.query('SELECT id, code, name FROM public.units WHERE is_active=true ORDER BY code'),
    pool.query(`SELECT co.id, co.code, co.name, co.platform_id, pl.name AS platform_name
                  FROM public.countries co LEFT JOIN public.platforms pl ON pl.id = co.platform_id
                 WHERE co.is_active=true ORDER BY co.name`),
    pool.query('SELECT id, name FROM public.ga_groups WHERE is_active=true ORDER BY name'),
    pool.query('SELECT id, code, name FROM public.cost_centers WHERE is_active=true ORDER BY name'),
    pool.query('SELECT id, name FROM public.solution_types WHERE is_active=true ORDER BY name'),
    pool.query('SELECT id, code, name FROM public.currencies WHERE is_active=true ORDER BY code'),
  ])
  const platforms = await pool.query('SELECT id, name FROM public.platforms WHERE is_active=true ORDER BY name')

  return (
    <Layout user={user}>
      <SuppliersClient types={types.rows} categories={cats.rows} projects={projs.rows} units={units.rows}
        countries={countries.rows} platforms={platforms.rows} gaGroups={gaGroups.rows} costCenters={costCenters.rows} solutionTypes={solutionTypes.rows}
        currencies={currencies.rows} />
    </Layout>
  )
}
