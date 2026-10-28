import { getCurrentUser, canManageInventory } from '@/lib/auth'
import { writableUnitIds } from '@/lib/scope'
import { redirect } from 'next/navigation'
import Layout from '@/components/Layout'
import pool from '@/lib/db'
import AssetsClient from './AssetsClient'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const user = getCurrentUser()
  if (!user) redirect('/login')
  if (!canManageInventory(user)) redirect('/')

  const scope = await writableUnitIds(user)
  const unitsQ = scope
    ? await pool.query('SELECT id, code, name FROM public.units WHERE is_active=true AND id = ANY($1::uuid[]) ORDER BY code', [[...scope]])
    : await pool.query('SELECT id, code, name FROM public.units WHERE is_active=true ORDER BY code')
  const groupsQ = await pool.query(`SELECT id, code, name FROM public.asset_groups WHERE is_active=true AND kind='HARDWARE' ORDER BY sort`)

  return (
    <Layout user={user}>
      <AssetsClient groups={groupsQ.rows} units={unitsQ.rows} />
    </Layout>
  )
}
