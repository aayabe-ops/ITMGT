import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import pool from '@/lib/db'
import Layout from '@/components/Layout'
import ReportClient from '../ReportClient'

export default async function ReportAnalisePage() {
  const user = getCurrentUser()
  if (!user) redirect('/login')

  const [countries, companies, units, categories, suppliers] = await Promise.all([
    pool.query(`SELECT c.id, c.code, c.name, cur.code AS currency_code
                  FROM public.countries c LEFT JOIN public.currencies cur ON cur.id = c.currency_id
                 WHERE c.is_active = true ORDER BY c.name`),
    pool.query('SELECT id, code, name, country_id FROM public.companies WHERE is_active=true ORDER BY name'),
    pool.query('SELECT u.id, u.code, u.name, u.country_id, u.company_id, u.unidade_id, ud.name AS unidade_nome FROM public.units u LEFT JOIN public.unidades ud ON ud.id = u.unidade_id WHERE u.is_active=true ORDER BY u.code'),
    pool.query('SELECT id, name FROM public.categories WHERE is_active=true ORDER BY name'),
    pool.query('SELECT id, name FROM public.suppliers WHERE is_active=true ORDER BY name'),
  ])

  return (
    <Layout user={user}>
      <ReportClient
        userRole={user.role}
        countries={countries.rows}
        companies={companies.rows}
        units={units.rows}
        categories={categories.rows}
        suppliers={suppliers.rows}
      />
    </Layout>
  )
}
