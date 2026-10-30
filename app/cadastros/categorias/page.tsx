import { getCurrentUser } from '@/lib/auth'
import { getTranslations } from 'next-intl/server'
import { redirect } from 'next/navigation'
import pool from '@/lib/db'
import Layout from '@/components/Layout'
import LookupCrud from '@/components/LookupCrud'

export default async function Page() {
  const user = getCurrentUser()
  if (!user) redirect('/login')
  if (user.role !== 'admin') redirect('/')

  // Grupos (master em supplier_types, reaproveitado) — opções do select de Grupo
  const { rows: grupos } = await pool.query('SELECT id, name FROM public.supplier_types WHERE is_active=true ORDER BY name')
  const t = await getTranslations('cad')

  return (
    <Layout user={user}>
      <LookupCrud endpoint="/api/categories" title={t('categoriesTitle')} subtitle={t('categoriesSub')} hasDescription
        extraFields={[
          { key: 'grupo_id', label: t('fGrupo'), options: grupos.map((g: any) => ({ value: g.id, label: g.name })) },
          {
            key: 'cost_class', label: t('fTratamento'),
            options: [
              { value: 'OPEX', label: 'OPEX' },
              { value: 'CAPEX', label: 'CAPEX' },
              { value: 'OTC', label: 'OPEX OTC' },
            ],
          },
        ]}
        guideNote={t('categoriesNote')}
        teach={{ what: t('categoriesWhat'), example: t('categoriesEx') }} />
    </Layout>
  )
}
