import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser, canManageInventory, isGlobalReader } from '@/lib/auth'
import { writableUnidadeIds } from '@/lib/scope'
import pool from '@/lib/db'

const noauth = () => NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

// Relatório combinado por Unidade: Financeiro (por natureza do CC: COGS/G&A/Holding/
// Transporte, com drill-down por categoria) + Inventário (ativos por grupo, licenças).
// Valores financeiros em USD (divide pela taxa anual month=0 do país do Centro de Custo).
export async function GET(req: NextRequest) {
  const user = getCurrentUser()
  if (!user || (!canManageInventory(user) && !isGlobalReader(user))) return noauth()

  const sp = req.nextUrl.searchParams
  const year = parseInt(sp.get('year') ?? String(new Date().getFullYear()))
  const base = sp.get('base') === 'actual' ? 'actual' : 'budget'

  const scope = await writableUnidadeIds(user)   // null = global
  const scopeArr = scope ? [...scope] : null

  // ---- Financeiro (Orçamento ou Realizado) agregado por Unidade × natureza × categoria ----
  const finParams: any[] = [year]
  let finScope = ''
  if (scopeArr) { finParams.push(scopeArr); finScope = ` AND un.id = ANY($${finParams.length}::uuid[])` }
  const fin = base === 'actual'
    ? await pool.query(
        `SELECT un.id AS unidade_id, un.name AS unidade_name,
                COALESCE(u.cost_nature,'COGS') AS cost_nature,
                COALESCE(cat.name,'—') AS category_name,
                SUM(al.value / COALESCE(er.usd_rate,1))::float AS value
           FROM public.actual_lines al
           JOIN public.units u      ON u.id = al.unit_id
           JOIN public.unidades un  ON un.id = u.unidade_id
           LEFT JOIN public.categories cat ON cat.id = al.category_id
           LEFT JOIN public.exchange_rates er ON er.country_id = u.country_id AND er.year = al.year AND er.month = 0
          WHERE al.year = $1 AND (al.origin::text IS DISTINCT FROM 'RATEADO_ORIGEM')${finScope}
          GROUP BY un.id, un.name, u.cost_nature, cat.name`, finParams)
    : await pool.query(
        `SELECT un.id AS unidade_id, un.name AS unidade_name,
                COALESCE(u.cost_nature,'COGS') AS cost_nature,
                COALESCE(cat.name,'—') AS category_name,
                SUM(b.value / COALESCE(er.usd_rate,1))::float AS value
           FROM public.budget_lines b
           JOIN public.units u      ON u.id = b.unit_id
           JOIN public.unidades un  ON un.id = u.unidade_id
           LEFT JOIN public.categories cat ON cat.id = b.category_id
           LEFT JOIN public.exchange_rates er ON er.country_id = u.country_id AND er.year = b.year AND er.month = 0
          WHERE b.year = $1 AND b.is_active = true${finScope}
          GROUP BY un.id, un.name, u.cost_nature, cat.name`, finParams)

  // ---- Inventário: ativos por Unidade × grupo ----
  const invParams: any[] = []
  let invScope = ''
  if (scopeArr) { invParams.push(scopeArr); invScope = ` AND un.id = ANY($${invParams.length}::uuid[])` }
  const assets = await pool.query(
    `SELECT un.id AS unidade_id, un.name AS unidade_name, g.name AS group_name, g.sort,
            COUNT(*)::int AS count
       FROM public.assets a
       JOIN public.asset_groups g ON g.id = a.asset_group_id
       JOIN public.unidades un ON un.id = a.unidade_id
      WHERE a.is_active = true${invScope}
      GROUP BY un.id, un.name, g.name, g.sort
      ORDER BY g.sort`, invParams)

  const lics = await pool.query(
    `SELECT un.id AS unidade_id, un.name AS unidade_name, g.name AS group_name,
            COUNT(*)::int AS licenses,
            COALESCE(SUM(l.seats),0)::int AS seats,
            COALESCE(SUM(l.seats_used),0)::int AS seats_used
       FROM public.licenses l
       JOIN public.asset_groups g ON g.id = l.asset_group_id
       JOIN public.unidades un ON un.id = l.unidade_id
      WHERE l.is_active = true${invScope}
      GROUP BY un.id, un.name, g.name`, invParams)

  return NextResponse.json({
    year, base,
    fin: fin.rows,
    assets: assets.rows,
    lics: lics.rows,
  })
}
