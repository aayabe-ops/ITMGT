import { getCurrentUser, canManageInventory } from '@/lib/auth'
import { writableUnidadeIds } from '@/lib/scope'
import { redirect } from 'next/navigation'
import Layout from '@/components/Layout'
import pool from '@/lib/db'
import LicensesClient from './LicensesClient'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const user = getCurrentUser()
  if (!user) redirect('/login')
  if (!canManageInventory(user)) redirect('/')

  const scope = await writableUnidadeIds(user)
  const unidadesQ = scope
    ? await pool.query('SELECT id, code, name FROM public.unidades WHERE is_active=true AND id = ANY($1::uuid[]) ORDER BY code', [[...scope]])
    : await pool.query('SELECT id, code, name FROM public.unidades WHERE is_active=true ORDER BY code')
  const groupsQ = await pool.query(`SELECT id, code, name FROM public.asset_groups WHERE is_active=true AND kind='SOFTWARE' ORDER BY sort`)

  return (
    <Layout user={user}>
      <LicensesClient groups={groupsQ.rows} unidades={unidadesQ.rows} isGlobal={scope === null} />
    </Layout>
  )
}
