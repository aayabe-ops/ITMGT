import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import pool from '@/lib/db'
import Layout from '@/components/Layout'
import HierCrud from '@/components/HierCrud'

export default async function Page() {
  const user = getCurrentUser()
  if (!user) redirect('/login')
  if (user.role !== 'admin') redirect('/')
  const { rows: platforms } = await pool.query('SELECT id, code, name FROM public.platforms WHERE is_active=true ORDER BY name')
  return (
    <Layout user={user}>
      <HierCrud endpoint="/api/countries" title="Países" subtitle="Cada país pertence a uma plataforma (11 países)"
        parentLabel="Plataforma" parentField="platform_id" parents={platforms}
        teach={{ what: 'países', example: 'Cada país pertence a uma plataforma e tem uma moeda. Ex.: Brasil (BRL), Uruguai (UYU).' }} />
    </Layout>
  )
}
