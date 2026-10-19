import { getCurrentUser, canManageBudget } from '@/lib/auth'
import { writableUnitIds } from '@/lib/scope'
import { redirect } from 'next/navigation'
import pool from '@/lib/db'
import Layout from '@/components/Layout'
import BudgetUploadClient from './BudgetUploadClient'

export default async function BudgetUploadPage() {
  const user = getCurrentUser()
  if (!user) redirect('/login')
  if (!canManageBudget(user)) redirect('/')

  // 6b (UX) — unidades limitadas à geografia do usuário (null = todas)
  const w = await writableUnitIds(user); const wArr = w ? [...w] : null
  const unitsWhere = wArr ? 'WHERE u.is_active=true AND u.id = ANY($1::uuid[])' : 'WHERE u.is_active=true'

  const { rows: units }      = await pool.query(`SELECT u.id, u.code, u.name, u.unidade_id, ud.name AS unidade_nome FROM public.units u LEFT JOIN public.unidades ud ON ud.id = u.unidade_id ${unitsWhere} ORDER BY u.code`, wArr ? [wArr] : [])
  const { rows: categories } = await pool.query('SELECT id, code, name FROM public.categories WHERE is_active=true ORDER BY name')
  const { rows: suppliers }  = await pool.query('SELECT id, name, short_name FROM public.suppliers WHERE is_active=true ORDER BY name')
  const { rows: currencies } = await pool.query('SELECT id, code, name FROM public.currencies WHERE is_active=true ORDER BY code')
  const { rows: services }   = await pool.query('SELECT supplier_id, category_id, cost_class::text AS cost_class, unit_id FROM public.contracts WHERE is_active=true')

  return (
    <Layout user={user}>
      <BudgetUploadClient units={units} categories={categories} suppliers={suppliers} currencies={currencies} services={services} />
    </Layout>
  )
}
