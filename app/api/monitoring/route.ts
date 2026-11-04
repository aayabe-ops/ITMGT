import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser, isGlobalReader } from '@/lib/auth'
import pool from '@/lib/db'

// Trilha de auditoria — só leitores globais (admin/diretor).
export async function GET(req: NextRequest) {
  const u = getCurrentUser()
  if (!u || !isGlobalReader(u)) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const params: any[] = []
  const conds: string[] = []
  const group = sp.get('group') // ACCESS | ACTIVITY
  if (group === 'ACCESS') conds.push(`action IN ('LOGIN_OK','LOGIN_FAIL','LOGOUT','LANG')`)
  else if (group === 'ACTIVITY') conds.push(`action IN ('CREATE','UPDATE','DELETE','IMPORT')`)
  const action = sp.get('action'); if (action) { params.push(action); conds.push(`action = $${params.length}`) }
  const userq = sp.get('user'); if (userq) { params.push(`%${userq.toLowerCase()}%`); conds.push(`lower(user_email) LIKE $${params.length}`) }
  const entity = sp.get('entity'); if (entity) { params.push(entity); conds.push(`entity = $${params.length}`) }
  const from = sp.get('from'); if (from) { params.push(from); conds.push(`ts >= $${params.length}`) }
  const to = sp.get('to'); if (to) { params.push(to + ' 23:59:59.999'); conds.push(`ts <= $${params.length}`) }
  const limit = Math.min(Math.max(parseInt(sp.get('limit') || '300'), 1), 2000)
  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : ''

  const { rows } = await pool.query(
    `SELECT id, ts, user_email, action, entity, entity_id, detail, ip
       FROM public.audit_log ${where} ORDER BY ts DESC LIMIT ${limit}`, params)

  // KPIs gerais (independentes do filtro)
  const { rows: [k] } = await pool.query(`
    SELECT
      (SELECT count(*) FROM public.audit_log WHERE action='LOGIN_OK'   AND ts >= now() - interval '24 hours')::int AS logins_24h,
      (SELECT count(*) FROM public.audit_log WHERE action='LOGIN_FAIL' AND ts >= now() - interval '24 hours')::int AS fails_24h,
      (SELECT count(DISTINCT user_email) FROM public.audit_log WHERE action='LOGIN_OK' AND ts >= now() - interval '7 days')::int AS users_7d,
      (SELECT count(*) FROM public.audit_log WHERE action IN ('CREATE','UPDATE','DELETE','IMPORT') AND ts >= now() - interval '7 days')::int AS changes_7d`)

  return NextResponse.json({ rows, kpi: k })
}
