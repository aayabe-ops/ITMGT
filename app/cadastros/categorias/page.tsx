import { getCurrentUser } from '@/lib/auth'
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

  return (
    <Layout user={user}>
      <LookupCrud endpoint="/api/categories" title="Categorias" subtitle="Categorias de custo de TI (agrupadas por Grupo)" hasDescription
        extraFields={[
          { key: 'grupo_id', label: 'Grupo', options: grupos.map((g: any) => ({ value: g.id, label: g.name })) },
          {
            key: 'cost_class', label: 'Tratamento',
            options: [
              { value: 'OPEX', label: 'OPEX' },
              { value: 'CAPEX', label: 'CAPEX' },
              { value: 'OTC', label: 'OPEX OTC' },
            ],
          },
        ]}
        guideNote="O Grupo é o nível 1 da taxonomia de TI (Aplicações & Software, Infra & Cloud, Telecom…). O Tratamento (OPEX/CAPEX) define a natureza contábil; o fornecedor pode sobrepor." />
    </Layout>
  )
}
