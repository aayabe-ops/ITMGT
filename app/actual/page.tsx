import { getCurrentUser } from '@/lib/auth'
import { writableUnitIds } from '@/lib/scope'
import { redirect } from 'next/navigation'
import pool from '@/lib/db'
import Layout from '@/components/Layout'
import ActualClient from './ActualClient'

export default async function ActualPage() {
  const user = getCurrentUser()
  if (!user) redirect('/login')

  // 6b (UX) — dropdown de unidade limitado à geografia do usuário (null = todas)
  const w = await writableUnitIds(user); const wArr = w ? [...w] : null
  const unitsWhere = wArr ? 'WHERE u.is_active=true AND u.id = ANY($1::uuid[])' : 'WHERE u.is_active=true'
  const unitsParams = wArr ? [wArr] : []

  const [units, categories, suppliers, countries, platforms, scopeRows] = await Promise.all([
    pool.query(`SELECT u.id, u.code, u.name, u.country_id, u.company_id, u.unidade_id, ud.name AS unidade_nome FROM public.units u LEFT JOIN public.unidades ud ON ud.id = u.unidade_id ${unitsWhere} ORDER BY u.code`, unitsParams),
    pool.query('SELECT id, code, name, cost_class FROM public.categories WHERE is_active=true ORDER BY name'),
    pool.query('SELECT id, name, short_name FROM public.suppliers WHERE is_active=true ORDER BY name'),
    pool.query('SELECT id, code, name, platform_id FROM public.countries WHERE is_active=true ORDER BY name'),
    pool.query('SELECT id, name FROM public.platforms WHERE is_active=true ORDER BY name'),
    pool.query('SELECT platform_id, country_id, unit_id FROM public.users WHERE id=$1', [user.id]),
  ])
  const scope = scopeRows.rows[0] || { platform_id: null, country_id: null, unit_id: null }
  const unit = user.unit_id ? units.rows.find((u: any) => u.id === user.unit_id) ?? null : null

  return (
    <Layout user={user} unit={unit}>
      <ActualClient user={user} units={units.rows} categories={categories.rows} suppliers={suppliers.rows}
        countries={countries.rows} platforms={platforms.rows} scope={scope} />
    </Layout>
  )
}
