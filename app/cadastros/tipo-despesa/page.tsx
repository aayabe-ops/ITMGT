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
      <LookupCrud endpoint="/api/expense-types" title={t('expenseTypesTitle')} subtitle={t('expenseTypesSub')} />
    </Layout>
  )
}
