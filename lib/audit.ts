import pool from '@/lib/db'
import { headers } from 'next/headers'

// IP do cliente (atrás de proxy usa X-Forwarded-For). Best-effort.
export function clientIp(): string | null {
  try {
    const h = headers()
    const fwd = h.get('x-forwarded-for')
    if (fwd) return fwd.split(',')[0].trim()
    return h.get('x-real-ip') || null
  } catch { return null }
}

export type AuditAction = 'LOGIN_OK' | 'LOGIN_FAIL' | 'LOGOUT' | 'CREATE' | 'UPDATE' | 'DELETE' | 'IMPORT' | 'LANG' | string

// Registra um evento de auditoria. NUNCA lança — o log não pode quebrar a operação.
export async function audit(e: {
  user_id?: string | null; user_email?: string | null; action: AuditAction
  entity?: string | null; entity_id?: string | null; detail?: string | null; ip?: string | null
}): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO public.audit_log(user_id, user_email, action, entity, entity_id, detail, ip)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [e.user_id || null, e.user_email || null, e.action, e.entity || null, e.entity_id || null, e.detail || null, e.ip ?? clientIp()],
    )
  } catch { /* silencioso de propósito */ }
}
