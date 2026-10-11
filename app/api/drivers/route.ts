import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import pool from '@/lib/db'

const noauth = () => NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
const KINDS = ['VALUE', 'MANUAL', 'EQUAL', 'DIRECT']
const METRICS = ['QUANTIDADE', 'VALOR', 'HORA', 'PERCENTUAL', 'NENHUMA']

// slug a partir do nome, para o code quando não informado
const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'DRIVER'

// Regra: driver "por valor" (VALUE) exige unidade de medida; os demais não.
function normUom(kind: string, metric: any, unit_label: any) {
  if (kind !== 'VALUE') return { metric: 'NENHUMA', unit_label: kind === 'MANUAL' ? (unit_label || '%') : null, err: '' }
  const mt = String(metric || '').toUpperCase()
  if (!METRICS.includes(mt) || mt === 'NENHUMA') return { metric: null, unit_label: null, err: 'Driver "por valor" exige uma métrica (Quantidade, Valor, Hora ou %).' }
  const ul = String(unit_label || '').trim()
  if (!ul) return { metric: null, unit_label: null, err: 'Informe a unidade de medida (ex.: Licenças, Horas, R$).' }
  return { metric: mt, unit_label: ul, err: '' }
}

export async function GET() {
  const user = getCurrentUser(); if (!user || user.role !== 'admin') return noauth()
  const { rows } = await pool.query(
    `SELECT d.id, d.code, d.name, d.kind, d.metric, d.unit_label, d.is_active,
            (SELECT count(*) FROM public.rateio_criteria rc WHERE rc.driver_id=d.id)::int AS em_regras,
            (SELECT count(*) FROM public.driver_values dv WHERE dv.driver_id=d.id)::int AS em_bases
       FROM public.allocation_drivers d
      ORDER BY d.is_active DESC,
               CASE d.kind WHEN 'VALUE' THEN 0 WHEN 'MANUAL' THEN 1 WHEN 'EQUAL' THEN 2 ELSE 3 END,
               d.name`)
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const user = getCurrentUser(); if (!user || user.role !== 'admin') return noauth()
  const b: any = await req.json().catch(() => ({}))
  const name = String(b?.name || '').trim()
  const kind = String(b?.kind || '').toUpperCase()
  if (!name) return NextResponse.json({ error: 'Nome é obrigatório.' }, { status: 400 })
  if (!KINDS.includes(kind)) return NextResponse.json({ error: 'Tipo de cálculo inválido.' }, { status: 400 })
  const uom = normUom(kind, b?.metric, b?.unit_label)
  if (uom.err) return NextResponse.json({ error: uom.err }, { status: 400 })
  const code = (String(b?.code || '').trim() || slug(name)).toUpperCase()
  try {
    const { rows } = await pool.query(
      `INSERT INTO public.allocation_drivers (code, name, kind, metric, unit_label, is_active)
       VALUES ($1,$2,$3,$4,$5, COALESCE($6,true)) RETURNING id`,
      [code, name, kind, uom.metric, uom.unit_label, b?.is_active])
    return NextResponse.json({ ok: true, id: rows[0].id })
  } catch (e: any) {
    if (e?.code === '23505') return NextResponse.json({ error: `Já existe driver com o código "${code}".` }, { status: 409 })
    return NextResponse.json({ error: e?.message || 'Erro ao criar driver.' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  const user = getCurrentUser(); if (!user || user.role !== 'admin') return noauth()
  const b: any = await req.json().catch(() => ({}))
  const id = b?.id
  if (!id) return NextResponse.json({ error: 'ID obrigatório.' }, { status: 400 })
  const name = String(b?.name || '').trim()
  const kind = String(b?.kind || '').toUpperCase()
  if (!name) return NextResponse.json({ error: 'Nome é obrigatório.' }, { status: 400 })
  if (!KINDS.includes(kind)) return NextResponse.json({ error: 'Tipo de cálculo inválido.' }, { status: 400 })
  const uom = normUom(kind, b?.metric, b?.unit_label)
  if (uom.err) return NextResponse.json({ error: uom.err }, { status: 400 })
  try {
    await pool.query(
      `UPDATE public.allocation_drivers
          SET name=$2, kind=$3, metric=$4, unit_label=$5, is_active=COALESCE($6, is_active)
        WHERE id=$1`,
      [id, name, kind, uom.metric, uom.unit_label, b?.is_active])
    return NextResponse.json({ ok: true })
  } catch (e: any) { return NextResponse.json({ error: e?.message || 'Erro ao salvar driver.' }, { status: 500 }) }
}

export async function DELETE(req: NextRequest) {
  const user = getCurrentUser(); if (!user || user.role !== 'admin') return noauth()
  const id = new URL(req.url).searchParams.get('id') || (await req.json().catch(() => ({})))?.id
  if (!id) return NextResponse.json({ error: 'ID obrigatório.' }, { status: 400 })
  // guarda: não apaga driver em uso por regras ou bases
  const { rows: [u] } = await pool.query(
    `SELECT (SELECT count(*) FROM public.rateio_criteria WHERE driver_id=$1)::int AS r,
            (SELECT count(*) FROM public.driver_values  WHERE driver_id=$1)::int AS b`, [id])
  if (u.r > 0 || u.b > 0) {
    return NextResponse.json({ error: `Driver em uso (${u.r} regra(s), ${u.b} base(s)). Desative em vez de apagar.` }, { status: 409 })
  }
  await pool.query('DELETE FROM public.allocation_drivers WHERE id=$1', [id])
  return NextResponse.json({ ok: true })
}
