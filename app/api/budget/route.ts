import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser, canManageBudget } from '@/lib/auth'
import pool from '@/lib/db'
import { writableUnitIds, outOfScopeMsg } from '@/lib/scope'

// Espera: { rows: [{ unit_id, category_id, supplier_id?, project_id?, year?, month, value }], year? }
// Cada linha vira uma nova versão ativa em budget_lines para a chave
// (unit, category, supplier, project, year, month). supplier/project podem ser nulos.
export async function POST(req: NextRequest) {
  const user = getCurrentUser()
  if (!canManageBudget(user)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const data = await req.json().catch(() => null)
  if (!data || !Array.isArray(data.rows) || data.rows.length === 0) {
    return NextResponse.json({ error: 'Nenhuma linha recebida.' }, { status: 400 })
  }

  const defaultYear = parseInt(data.year) || new Date().getFullYear()

  // 6b — escopo geográfico de escrita (Gerente). Barra linhas fora do escopo e,
  // no replace_year, restringe o DELETE às unidades do usuário (não apaga outras regiões).
  const wScope = await writableUnitIds(user)
  if (wScope) {
    const bad = new Set((data.rows as any[]).map(r => r.unit_id).filter((id: string) => id && !wScope.has(id)))
    if (bad.size) return NextResponse.json({ error: outOfScopeMsg(bad.size) }, { status: 403 })
  }

  // OPEX/CAPEX/OTC definido no LANÇAMENTO (linha); a categoria é só o padrão. Fornecedor NÃO define.
  const CC_SET = ['CAPEX', 'OPEX', 'OTC']
  const normCC = (v: any) => { const s = String(v || '').toUpperCase().trim(); return CC_SET.includes(s) ? s : null }
  const catCC: Record<string, string> = {}
  for (const r of (await pool.query('SELECT id, cost_class FROM public.categories WHERE cost_class IS NOT NULL')).rows) catCC[r.id] = r.cost_class
  const effCC = (r: any) => normCC(r.cost_class) || catCC[r.category_id] || null

  // Carga de ano inteiro (importador de planilha): substitui TODAS as linhas do ano
  // e insere cada linha do arquivo como uma linha de budget (sem colapso por chave).
  // Assim o total gravado bate exatamente com o arquivo, e itens distintos
  // (mesma unidade/categoria/fornecedor/mês, descrições diferentes) coexistem.
  if (data.mode === 'replace_year') {
    let saved = 0, errors = 0
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      if (wScope) await client.query('DELETE FROM public.budget_lines WHERE year=$1 AND unit_id = ANY($2::uuid[])', [defaultYear, [...wScope]])
      else await client.query('DELETE FROM public.budget_lines WHERE year = $1', [defaultYear])
      // O índice único budget_lines_uk inclui `version`. Linhas-item distintas na
      // mesma célula (unidade/categoria/fornecedor/projeto/mês) recebem versões
      // incrementais para coexistirem (todas ativas); a view soma todas.
      const verByKey = new Map<string, number>()
      const NIL = '00000000-0000-0000-0000-000000000000'
      for (const r of data.rows) {
        const unit_id = r.unit_id
        const category_id = r.category_id
        const supplier_id = r.supplier_id || null
        const project_id = r.project_id || null
        const month = parseInt(r.month)
        const value = Number(r.value)
        if (!unit_id || !category_id || !(month >= 1 && month <= 12) || !isFinite(value)) { errors++; continue }
        const key = `${unit_id}|${category_id}|${supplier_id || NIL}|${project_id || NIL}|${month}`
        const version = (verByKey.get(key) || 0) + 1
        verByKey.set(key, version)
        try {
          await client.query(
            `INSERT INTO public.budget_lines
               (unit_id, category_id, supplier_id, project_id, year, month, value, version, is_active, uploaded_by, descricao, kpi, currency, cost_class)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,$9,$10,$11,$12,$13)`,
            [unit_id, category_id, supplier_id, project_id, defaultYear, month, value, version, user.id,
             r.descricao || null, r.kpi || null, r.currency || null, effCC(r)])
          saved++
        } catch { errors++ }
      }
      await client.query('COMMIT')
    } catch (e: any) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: e?.message || 'Erro ao substituir o orçamento do ano.' }, { status: 500 })
    } finally {
      client.release()
    }
    return NextResponse.json({ saved, errors, count: saved, replaced_year: defaultYear })
  }

  let saved = 0
  let errors = 0
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (const r of data.rows) {
      const unit_id = r.unit_id
      const category_id = r.category_id
      const supplier_id = r.supplier_id || null
      const project_id = r.project_id || null
      const year = parseInt(r.year) || defaultYear
      const month = parseInt(r.month)
      const value = Number(r.value)

      if (!unit_id || !category_id || !(month >= 1 && month <= 12) || !isFinite(value)) {
        errors++
        continue
      }

      // chave de versão inclui supplier/project (IS NOT DISTINCT FROM trata NULL=NULL)
      const keySql = `unit_id=$1 AND category_id=$2 AND supplier_id IS NOT DISTINCT FROM $3
                      AND project_id IS NOT DISTINCT FROM $4 AND year=$5 AND month=$6 AND is_active=true`
      const keyParams = [unit_id, category_id, supplier_id, project_id, year, month]

      try {
        const { rows: existing } = await client.query(
          `SELECT version FROM public.budget_lines WHERE ${keySql} ORDER BY version DESC LIMIT 1`,
          keyParams
        )
        const newVersion = existing.length > 0 ? existing[0].version + 1 : 1

        if (existing.length > 0) {
          await client.query(`UPDATE public.budget_lines SET is_active=false WHERE ${keySql}`, keyParams)
        }

        await client.query(
          `INSERT INTO public.budget_lines
             (unit_id, category_id, supplier_id, project_id, year, month, value, version, is_active, uploaded_by, descricao, kpi, currency, cost_class)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,$9,$10,$11,$12,$13)`,
          [unit_id, category_id, supplier_id, project_id, year, month, value, newVersion, user.id,
           r.descricao || null, r.kpi || null, r.currency || null, effCC(r)]
        )
        saved++
      } catch {
        errors++
      }
    }
    await client.query('COMMIT')
  } catch (e: any) {
    await client.query('ROLLBACK')
    return NextResponse.json({ error: e?.message || 'Erro ao salvar orçamento.' }, { status: 500 })
  } finally {
    client.release()
  }

  return NextResponse.json({ saved, errors, count: saved })
}
