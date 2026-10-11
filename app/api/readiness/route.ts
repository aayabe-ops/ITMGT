import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import pool from '@/lib/db'

// Prontidão (F5/Fase 1): contagem dos cadastros + checagens de integridade,
// usada pelos painéis "Pronto para orçar" e "Pronto para ratear".
export async function GET() {
  const u = getCurrentUser()
  if (!u || u.role !== 'admin') return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const sql = `
    SELECT json_build_object(
      'currencies',    (SELECT count(*) FROM public.currencies WHERE is_active),
      'platforms',     (SELECT count(*) FROM public.platforms),
      'countries',     (SELECT count(*) FROM public.countries),
      'exchange',      (SELECT count(*) FROM public.exchange_rates),
      'companies',     (SELECT count(*) FROM public.companies WHERE is_active),
      'unidades',      (SELECT count(*) FROM public.unidades WHERE is_active),
      'units',         (SELECT count(*) FROM public.units WHERE is_active),
      'units_orphan',  (SELECT count(*) FROM public.units WHERE is_active AND unidade_id IS NULL),
      'categories',    (SELECT count(*) FROM public.categories WHERE is_active),
      'suppliers',     (SELECT count(*) FROM public.suppliers WHERE is_active),
      'contracts',     (SELECT count(*) FROM public.contracts),
      'projects',      (SELECT count(*) FROM public.projects),
      'drivers',       (SELECT count(*) FROM public.allocation_drivers WHERE is_active),
      'criteria',      (SELECT count(*) FROM public.rateio_criteria WHERE is_active),
      'driver_bases',  (SELECT count(DISTINCT driver_id) FROM public.driver_values)
    ) AS data`
  try {
    const { rows } = await pool.query(sql)
    const d = rows[0].data
    // portões (gates) derivados
    d.gates = {
      budget: d.unidades > 0 && d.units > 0 && d.categories > 0,
      rateio: d.drivers > 0 && d.criteria > 0 && d.driver_bases > 0,
    }
    return NextResponse.json(d)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erro ao calcular prontidão.' }, { status: 200 })
  }
}
