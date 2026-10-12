import { getCurrentUser, canManageBudget } from '@/lib/auth'
import { redirect } from 'next/navigation'
import pool from '@/lib/db'
import Layout from '@/components/Layout'
import BudgetUploadClient from './BudgetUploadClient'

export default async function BudgetUploadPage() {
  const user = getCurrentUser()
  if (!user) redirect('/login')
  if (!canManageBudget(user)) redirect('/')

  const { rows: units }      = await pool.query('SELECT u.id, u.code, u.name, u.unidade_id, ud.name AS unidade_nome FROM public.units u LEFT JOIN public.unidades ud ON ud.id = u.unidade_id WHERE u.is_active=true ORDER BY u.code')
  const { rows: categories } = await pool.query('SELECT id, code, name FROM public.categories WHERE is_active=true ORDER BY name')
  const { rows: suppliers }  = await pool.query('SELECT id, name, short_name, category_id, cost_class::text AS cost_class FROM public.suppliers WHERE is_active=true ORDER BY name')
  const { rows: currencies } = await pool.query('SELECT id, code, name FROM public.currencies WHERE is_active=true ORDER BY code')

  return (
    <Layout user={user}>
      <BudgetUploadClient units={units} categories={categories} suppliers={suppliers} currencies={currencies} />
    </Layout>
  )
}
