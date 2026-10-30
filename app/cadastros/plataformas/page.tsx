import { getCurrentUser } from '@/lib/auth'
import { getTranslations } from 'next-intl/server'
import { redirect } from 'next/navigation'
import Layout from '@/components/Layout'
import LookupCrud from '@/components/LookupCrud'

export default async function Page() {
  const user = getCurrentUser()
  if (!user) redirect('/login')
  if (user.role !== 'admin') redirect('/')
  const t = await getTranslations('cad')
  return (
    <Layout user={user}>
      <LookupCrud endpoint="/api/platforms" title={t('platformsTitle')} subtitle={t('platformsSub')}
        teach={{ what: t('platformsWhat'), example: t('platformsEx') }} />
    </Layout>
  )
}
