import { getCurrentUser } from '@/lib/auth'
import { getTranslations } from 'next-intl/server'
import { redirect } from 'next/navigation'
import pool from '@/lib/db'
import Layout from '@/components/Layout'
import HierCrud from '@/components/HierCrud'

export default async function Page() {
  const user = getCurrentUser()
  if (!user) redirect('/login')
  if (user.role !== 'admin') redirect('/')
  const { rows: platforms } = await pool.query('SELECT id, code, name FROM public.platforms WHERE is_active=true ORDER BY name')
  const t = await getTranslations('cad')
  return (
    <Layout user={user}>
      <HierCrud endpoint="/api/countries" title={t('countriesTitle')} subtitle={t('countriesSub')}
        parentLabel={t('platformLabel')} parentField="platform_id" parents={platforms}
        teach={{ what: t('countriesWhat'), example: t('countriesEx') }} />
    </Layout>
  )
}
