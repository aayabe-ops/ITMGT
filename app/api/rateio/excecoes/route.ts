import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import pool from '@/lib/db'

// Item 3 — Painel de exceções do Realizado.
// Lista as despesas realizadas DIRETO (não rateadas — sem regra que case) do período,
// agrupadas por fornecedor + categoria, sinalizando se a categoria estava no budget
// ("planejada") ou não ("fora do budget"). Serve para decidir: criar regra ou aceitar direto.
// ?year= (obrigatório) &month= (0/ausente = ano inteiro) &usd=1 (opcional)
export async function GET(req: NextRequest) {
  const u = getCurrentUser(); if (!u || u.role !== 'admin') return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const sp = req.nextUrl.searchParams
  const year = parseInt(sp.get('year') || '') || new Date().getFullYear()
  const month = parseInt(sp.get('month') || '') || 0
  const usd = sp.get('usd') === '1'

  const mClause = month > 0 ? 'AND al.month = $2' : ''
  const params: any[] = month > 0 ? [year, month] : [year]
  const v = usd ? '(al.value / COALESCE(er.usd_rate, 1))' : 'al.value'

  const sql = `
    SELECT al.supplier_id, al.category_id,
           COALESCE(s.short_name, s.name, '— sem fornecedor —') AS supplier_name,
           COALESCE(c.name, '— sem categoria —')               AS category_name,
           COUNT(DISTINCT al.unit_id)::int AS ccs,
           COUNT(*)::int                   AS lancamentos,
           SUM(${v})::float                AS total,
           EXISTS (
             SELECT 1 FROM public.budget_lines bl
              WHERE bl.year = $1 AND bl.is_active = true AND bl.category_id = al.category_id
           ) AS in_budget
      FROM public.actual_lines al
      JOIN public.units u    ON u.id = al.unit_id
      LEFT JOIN public.exchange_rates er ON er.country_id = u.country_id AND er.year = $1 AND er.month = 0
      LEFT JOIN public.suppliers s  ON s.id = al.supplier_id
      LEFT JOIN public.categories c ON c.id = al.category_id
     WHERE al.year = $1 AND al.origin::text = 'DIRETO' ${mClause}
     GROUP BY al.supplier_id, al.category_id, s.short_name, s.name, c.name
     ORDER BY in_budget ASC, SUM(al.value) DESC`
  try {
    const { rows } = await pool.query(sql, params)
    return NextResponse.json({ year, month, currency: usd ? 'USD' : 'BRL', rows })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erro ao gerar exceções.' }, { status: 200 })
  }
}
