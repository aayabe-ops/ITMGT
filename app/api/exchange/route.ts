import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import pool from '@/lib/db'

// month = 0 => taxa ANUAL. usd_rate = quanto da moeda local vale 1 USD.
export async function GET(req: NextRequest) {
  const user = getCurrentUser(); if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()))
  const { rows } = await pool.query(`
    SELECT co.id AS country_id, co.name AS country_name, co.currency_id,
           cu.code AS currency_code,
           er.usd_rate
    FROM public.countries co
    LEFT JOIN public.currencies cu ON cu.id = co.currency_id
    LEFT JOIN public.exchange_rates er ON er.country_id = co.id AND er.year = $1 AND er.month = 0
    WHERE co.is_active = true
    ORDER BY co.name`, [year])
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const user = getCurrentUser(); if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const b: any = await req.json().catch(() => null)
  if (!b?.country_id || !b?.year) return NextResponse.json({ error: 'País e ano obrigatórios.' }, { status: 400 })
  const year = parseInt(b.year)
  const rate = b.usd_rate === '' || b.usd_rate == null ? null : Number(b.usd_rate)
  try {
    if ('currency_id' in b) {
      await pool.query('UPDATE public.countries SET currency_id=$1 WHERE id=$2', [b.currency_id || null, b.country_id])
    }
    if (rate != null && isFinite(rate)) {
      await pool.query(
        `INSERT INTO public.exchange_rates(country_id, year, month, usd_rate)
         VALUES($1,$2,0,$3)
         ON CONFLICT (country_id, year, month) DO UPDATE SET usd_rate=$3`,
        [b.country_id, year, rate])
    }
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erro ao salvar câmbio.' }, { status: 400 })
  }
}
