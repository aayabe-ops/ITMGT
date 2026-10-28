import pool from '@/lib/db'

// 6b — Escopo geográfico de ESCRITA (Orçamento e Realizado).
// Só Analista e Gerente são limitados; admin/lançador/diretor não entram aqui.
// Sem atribuição geográfica no usuário → sem limite (global, incremental): a
// restrição só "liga" quando o usuário recebe país/unidade/plataforma.
const SCOPED_WRITE_ROLES = new Set(['analista', 'gerente'])

// Conjunto de unit_ids em que o usuário pode escrever, ou null = sem limite.
// Precedência (igual à leitura): unidade › multi-país › país › plataforma.
export async function writableUnitIds(user?: { id?: string; role?: string } | null): Promise<Set<string> | null> {
  if (!user?.id || !user.role || !SCOPED_WRITE_ROLES.has(user.role)) return null
  const { rows: [u] } = await pool.query('SELECT unit_id, country_id, platform_id FROM public.users WHERE id=$1', [user.id])
  if (!u) return null
  if (u.unit_id) return new Set<string>([u.unit_id])
  const mc = (await pool.query('SELECT country_id FROM public.user_countries WHERE user_id=$1', [user.id])).rows.map((r: any) => r.country_id)
  let rows: any[]
  if (mc.length) rows = (await pool.query('SELECT id FROM public.units WHERE country_id = ANY($1::uuid[])', [mc])).rows
  else if (u.country_id) rows = (await pool.query('SELECT id FROM public.units WHERE country_id=$1', [u.country_id])).rows
  else if (u.platform_id) rows = (await pool.query('SELECT un.id FROM public.units un JOIN public.countries co ON co.id=un.country_id WHERE co.platform_id=$1', [u.platform_id])).rows
  else return null   // sem atribuição → global
  return new Set<string>(rows.map((r: any) => r.id))
}

// Valida que todas as unidades informadas estão no escopo de escrita do usuário.
// { ok:true } quando global ou tudo dentro; senão { ok:false, count } de unidades fora.
export async function checkUnitsWritable(
  user: { id?: string; role?: string } | null | undefined,
  unitIds: (string | null | undefined)[],
): Promise<{ ok: true } | { ok: false; count: number }> {
  const scope = await writableUnitIds(user)
  if (scope === null) return { ok: true }
  const bad = [...new Set(unitIds.filter((id): id is string => !!id && !scope.has(id)))]
  return bad.length ? { ok: false, count: bad.length } : { ok: true }
}

export const outOfScopeMsg = (n: number) =>
  `Fora do seu escopo geográfico: ${n} unidade(s) não pertence(m) ao país/plataforma atribuído ao seu usuário.`

// Mesma lógica de escopo, mas em termos de UNIDADE (public.unidades), usada pelo
// Inventário de TI. unidades.country_id dá a geografia direto; um usuário com escopo
// de Centro de Custo (users.unit_id) é mapeado para a Unidade daquele CC.
export async function writableUnidadeIds(user?: { id?: string; role?: string } | null): Promise<Set<string> | null> {
  if (!user?.id || !user.role || !SCOPED_WRITE_ROLES.has(user.role)) return null
  const { rows: [u] } = await pool.query('SELECT unit_id, country_id, platform_id FROM public.users WHERE id=$1', [user.id])
  if (!u) return null
  if (u.unit_id) {
    const r = await pool.query('SELECT unidade_id FROM public.units WHERE id=$1', [u.unit_id])
    const uid = r.rows[0]?.unidade_id
    return new Set<string>(uid ? [uid] : [])
  }
  const mc = (await pool.query('SELECT country_id FROM public.user_countries WHERE user_id=$1', [user.id])).rows.map((r: any) => r.country_id)
  let rows: any[]
  if (mc.length) rows = (await pool.query('SELECT id FROM public.unidades WHERE country_id = ANY($1::uuid[])', [mc])).rows
  else if (u.country_id) rows = (await pool.query('SELECT id FROM public.unidades WHERE country_id=$1', [u.country_id])).rows
  else if (u.platform_id) rows = (await pool.query('SELECT un.id FROM public.unidades un JOIN public.countries co ON co.id=un.country_id WHERE co.platform_id=$1', [u.platform_id])).rows
  else return null
  return new Set<string>(rows.map((r: any) => r.id))
}

export async function checkUnidadesWritable(
  user: { id?: string; role?: string } | null | undefined,
  unidadeIds: (string | null | undefined)[],
): Promise<{ ok: true } | { ok: false; count: number }> {
  const scope = await writableUnidadeIds(user)
  if (scope === null) return { ok: true }
  const bad = [...new Set(unidadeIds.filter((id): id is string => !!id && !scope.has(id)))]
  return bad.length ? { ok: false, count: bad.length } : { ok: true }
}
