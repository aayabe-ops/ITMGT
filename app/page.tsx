import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import pool from '@/lib/db'
import Layout from '@/components/Layout'
import DashboardClient from './DashboardClient'

export default async function Home() {
  const user = getCurrentUser()
  if (!user) redirect('/login')

  const { rows: units } = await pool.query(
    `SELECT u.id, u.code, u.name, u.type, u.country_id, u.unidade_id, ud.name AS unidade_nome
       FROM public.units u
       LEFT JOIN public.unidades ud ON ud.id = u.unidade_id
      WHERE u.is_active=true ORDER BY u.code`
  )
  const { rows: categories } = await pool.query(
    'SELECT id, code, name FROM public.categories WHERE is_active=true ORDER BY name'
  )
  const { rows: suppliers } = await pool.query(
    'SELECT id, name, short_name FROM public.suppliers ORDER BY name'
  )
  const { rows: countries } = await pool.query(
    `SELECT c.id, c.code, c.name, c.platform_id, cur.code AS currency_code
       FROM public.countries c
       LEFT JOIN public.currencies cur ON cur.id = c.currency_id
      WHERE c.is_active=true ORDER BY c.name`
  )
  const { rows: platforms } = await pool.query(
    'SELECT id, code, name FROM public.platforms WHERE is_active=true ORDER BY name'
  )
  // escopo do usuário (JWT só tem unit_id → buscar país/plataforma no banco)
  const { rows: scopeRows } = await pool.query(
    'SELECT platform_id, country_id, unit_id FROM public.users WHERE id=$1',
    [user.id]
  )
  const scope = scopeRows[0] || { platform_id: null, country_id: null, unit_id: null }

  const unit = user.unit_id ? units.find((u: any) => u.id === user.unit_id) ?? null : null
  const defaultUnitId = user.role === 'unit_viewer' ? user.unit_id : null

  return (
    <Layout user={user} unit={unit}>
      <DashboardClient user={user} units={units} categories={categories} suppliers={suppliers} countries={countries} platforms={platforms} scope={scope} defaultUnitId={defaultUnitId} />
    </Layout>
  )
}
