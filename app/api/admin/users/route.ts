import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import pool from '@/lib/db'
import bcrypt from 'bcryptjs'

// Sincroniza os países do perfil Multi-País (N:N). Só mexe se receber um array.
async function syncUserCountries(userId: string, ids: any) {
  if (!Array.isArray(ids)) return
  await pool.query('DELETE FROM public.user_countries WHERE user_id=$1', [userId])
  for (const cid of ids.filter(Boolean)) {
    await pool.query('INSERT INTO public.user_countries(user_id, country_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [userId, cid])
  }
}

export async function GET() {
  const user = getCurrentUser()
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { rows } = await pool.query(`
    SELECT u.id, u.email, u.full_name, u.role, u.unit_id, u.platform_id, u.country_id, u.is_active,
           un.code AS unit_code, un.name AS unit_name,
           pl.name AS platform_name, co.name AS country_name,
           COALESCE(ARRAY(SELECT country_id FROM public.user_countries WHERE user_id = u.id), '{}') AS country_ids
    FROM public.users u
    LEFT JOIN public.units      un ON un.id = u.unit_id
    LEFT JOIN public.platforms  pl ON pl.id = u.platform_id
    LEFT JOIN public.countries  co ON co.id = u.country_id
    ORDER BY u.full_name
  `)
  return NextResponse.json(rows)
}

export async function PUT(req: NextRequest) {
  const user = getCurrentUser()
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await req.json()

  // Create new user
  if (body.create) {
    const { email, full_name, role, platform_id, country_id, unit_id, password } = body
    if (!email || !password) return NextResponse.json({ error: 'E-mail e senha são obrigatórios' }, { status: 400 })
    const hash = await bcrypt.hash(password, 10)
    const { rows } = await pool.query(
      `INSERT INTO public.users (email, full_name, password_hash, role, platform_id, country_id, unit_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [email, full_name || null, hash, role || 'unit_viewer', platform_id || null, country_id || null, unit_id || null]
    )
    await syncUserCountries(rows[0].id, body.country_ids)
    return NextResponse.json({ ok: true, id: rows[0].id })
  }

  // Update existing user
  const { id, full_name, role, platform_id, country_id, unit_id, is_active, password } = body
  if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 })

  if (password) {
    const hash = await bcrypt.hash(password, 10)
    await pool.query(
      `UPDATE public.users SET full_name=$1, role=$2, platform_id=$3, country_id=$4, unit_id=$5, is_active=$6, password_hash=$7 WHERE id=$8`,
      [full_name ?? null, role, platform_id || null, country_id || null, unit_id || null, is_active ?? true, hash, id]
    )
  } else {
    await pool.query(
      `UPDATE public.users SET full_name=$1, role=$2, platform_id=$3, country_id=$4, unit_id=$5, is_active=$6 WHERE id=$7`,
      [full_name ?? null, role, platform_id || null, country_id || null, unit_id || null, is_active ?? true, id]
    )
  }
  await syncUserCountries(id, body.country_ids)
  return NextResponse.json({ ok: true })
}
