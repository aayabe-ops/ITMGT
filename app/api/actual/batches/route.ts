import { NextResponse } from 'next/server'
import { getCurrentUser, canLancar } from '@/lib/auth'
import pool from '@/lib/db'

// Lista os últimos lotes de importação de Realizado (status do upload).
export async function GET() {
  const user = getCurrentUser()
  if (!canLancar(user)) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { rows } = await pool.query(`
    SELECT ba.id, ba.filename, ba.scope, ba.year, ba.month,
           ba.rows_total, ba.rows_ok, ba.rows_err, ba.status, ba.created_at,
           co.name AS country_name, u.code AS unit_code,
           us.full_name AS user_name
    FROM public.actual_upload_batches ba
    LEFT JOIN public.countries co ON co.id = ba.country_id
    LEFT JOIN public.units     u  ON u.id  = ba.unit_id
    LEFT JOIN public.users     us ON us.id = ba.created_by
    ORDER BY ba.created_at DESC
    LIMIT 30
  `)
  return NextResponse.json(rows)
}
