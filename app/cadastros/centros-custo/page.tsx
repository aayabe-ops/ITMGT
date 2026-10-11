import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import pool from '@/lib/db'
import Layout from '@/components/Layout'
import HierCrud from '@/components/HierCrud'

export default async function Page() {
  const user = getCurrentUser()
  if (!user) redirect('/login')
  if (user.role !== 'admin') redirect('/')
  const { rows: companies } = await pool.query('SELECT id, code, name FROM public.companies WHERE is_active=true ORDER BY name')
  return (
    <Layout user={user}>
      <HierCrud endpoint="/api/cost-centers" title="Centros de Custo" subtitle="Cada centro de custo pertence a uma empresa"
        parentLabel="Empresa" parentField="company_id" parents={companies} />
    </Layout>
  )
}
