'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { MONTHS_PT } from '@/lib/types'
import { yearOptions, DEFAULT_YEAR } from '@/lib/years'
import { Upload, Download, CheckCircle2, AlertTriangle, X, RefreshCw } from 'lucide-react'
import clsx from 'clsx'
import { readMatrix } from '@/lib/csv'

const BRL = (n: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 }).format(n)
const stripAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
const norm = (s: string) => stripAccents(String(s || '')).toLowerCase().trim()
const normHeader = (s: string) => norm(s).replace(/[\s_]+/g, '')

function parseValor(raw: string): number {
  let s = String(raw).replace(/[^0-9.,-]/g, '')
  if (s.includes('.') && s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  else if (s.includes(',')) s = s.replace(',', '.')
  const n = parseFloat(s); return isNaN(n) ? NaN : n
}

interface Opt { id: string; code?: string; name: string; short_name?: string; country_id?: string }
interface PRow {
  unit_code: string; cat: string; sup: string; proj: string; cc: string; doc: string; desc: string
  year: number; month: number; value: number
  unit_id?: string; category_id?: string; supplier_id?: string; project_id?: string; cost_class?: string
  payment_status?: string; paid_date?: string
  error?: string
}

export default function ImportActualClient({ countries, units, categories, suppliers, projects }: {
  countries: Opt[]; units: Opt[]; categories: Opt[]; suppliers: Opt[]; projects: Opt[]
}) {
  const now = new Date()
  const [countryId, setCountryId] = useState('')
  const [scope, setScope] = useState<'UNIT' | 'COUNTRY_FULL'>('UNIT')
  const [unitId, setUnitId] = useState('')
  const [year, setYear] = useState(DEFAULT_YEAR)
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [rows, setRows] = useState<PRow[]>([])
  const [fileName, setFileName] = useState('')
  const [importing, setImporting] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [batches, setBatches] = useState<any[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  const unitsOfCountry = units.filter(u => !countryId || u.country_id === countryId)

  const findUnit = (v: string) => { const k = norm(v); return units.find(u => norm(u.code || '') === k) || units.find(u => norm(u.name) === k) }
  // mapa Unidade (nome) → CCs, para resolver o CC pela unidade
  const unidadeMap: Record<string, any[]> = {}
  for (const u of units as any[]) { const k = norm((u as any).unidade_nome || ''); if (k) (unidadeMap[k] ||= []).push(u) }
  // tenta CÓDIGO DO CC; senão NOME DA UNIDADE (1 CC = automático; vários = ambíguo; empresa desempata)
  const resolveUnit = (v: string, empresa?: string): { unit?: any; err?: string } => {
    const direct = findUnit(v); if (direct) return { unit: direct }
    const ccs = unidadeMap[norm(v)]
    if (ccs && ccs.length) {
      if (empresa) { const m = ccs.find(c => norm(c.code).includes(norm(empresa)) || norm(c.name).includes(norm(empresa))); return m ? { unit: m } : { err: `empresa "${empresa}" não encontrada na unidade "${v}"` } }
      if (ccs.length === 1) return { unit: ccs[0] }
      return { err: `unidade "${v}" tem ${ccs.length} CCs — informe a coluna "empresa" (ou o centro_custo)` }
    }
    return {}
  }
  const findCat = (v: string) => { const k = norm(v); return categories.find(c => norm(c.code || '') === k) || categories.find(c => norm(c.name) === k) }
  const findSup = (v: string) => { if (!v) return undefined; const k = norm(v); return suppliers.find(s => norm(s.short_name || '') === k) || suppliers.find(s => norm(s.name) === k) }
  const findProj = (v: string) => { if (!v) return undefined; const k = norm(v); return projects.find(p => norm(p.code || '') === k) || projects.find(p => norm(p.name) === k) }

  const loadBatches = useCallback(async () => {
    const r = await fetch('/api/actual/batches'); const d = await r.json()
    setBatches(Array.isArray(d) ? d : [])
  }, [])
  useEffect(() => { loadBatches() }, [loadBatches])

  function downloadTemplate() {
    // CSV enxuto: 'unidade' é a chave (o sistema acha o CC); 'fornecedor' traz categoria e
    // tratamento do cadastro automaticamente. 'empresa' só quando a unidade tem vários CCs.
    // 'tratamento' e 'categoria' são OPCIONAIS — só preencha para sobrepor o cadastro.
    const header = 'unidade,empresa,fornecedor,ano,mes,valor,tratamento,doc_ref,descricao,status,data_pagamento'
    const ex = (units[0] as any)?.unidade_nome || units[0]?.code || 'UNIDADE'
    const sup = (suppliers[0] as any)?.short_name || suppliers[0]?.name || 'FORNECEDOR'
    const body = [
      `${ex},,${sup},${year},${month},1234.56,,NF-001,Exemplo pago,PAGO,${year}-${String(month).padStart(2, '0')}-10`,
      `${ex},,${sup},${year},${month},500.00,OTC,,Exemplo com tratamento sobreposto,PENDENTE,`,
    ].join('\r\n')
    const blob = new Blob(['﻿' + header + '\r\n' + body], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob); a.download = 'modelo_realizado.csv'; a.click()
  }
  // referência: unidades × como preencher (nome ou código do CC)
  function downloadUnidadesRef() {
    const esc = (s: any) => { const v = String(s ?? ''); return /[",;\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v }
    const m: Record<string, string[]> = {}
    for (const u of units as any[]) { const n = (u as any).unidade_nome || 'Sem unidade'; (m[n] ||= []).push(u.code || '') }
    const lines = ['unidade,qtd_ccs,como_preencher,centros_de_custo',
      ...Object.entries(m).sort((a, b) => a[0].localeCompare(b[0])).map(([n, codes]) =>
        [n, String(codes.length), codes.length === 1 ? 'usar NOME da unidade' : 'usar CODIGO do CC', codes.join(' | ')].map(esc).join(','))]
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'referencia_unidades.csv'; a.click(); URL.revokeObjectURL(a.href)
  }

  async function handleCSV(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    if (!countryId) { setMsg({ type: 'err', text: 'Selecione o país antes de subir o arquivo.' }); e.target.value = ''; return }
    if (scope === 'UNIT' && !unitId) { setMsg({ type: 'err', text: 'Selecione a unidade (escopo = uma unidade).' }); e.target.value = ''; return }
    setFileName(file.name); setMsg(null); setRows([])
    let matrix: string[][]
    try { matrix = await readMatrix(file) }
    catch { setMsg({ type: 'err', text: 'Não foi possível ler o arquivo. Verifique se é um CSV ou XLSX válido.' }); e.target.value = ''; return }
    if (!matrix.length) { setRows([]); e.target.value = ''; return }

    const H = matrix[0].map(normHeader)
    const idx = (...k: string[]) => H.findIndex(h => k.includes(h))
    const iU = idx('unidade', 'codigounidade', 'codunidade', 'centrocusto', 'cc', 'centro', 'site', 'filial'), iC = idx('categoria', 'cod', 'codcategoria', 'categoriacodigo')
    const iF = idx('fornecedor', 'supplier'), iA = idx('ano', 'year'), iM = idx('mes', 'month'), iV = idx('valor', 'value')
    const iP = idx('projeto', 'project'), iCC = idx('tratamento', 'capexopex', 'capex', 'costclass', 'classe'), iD = idx('docref', 'doc', 'nf'), iDe = idx('descricao', 'desc', 'note')
    const iSt = idx('status', 'pagamento', 'statuspagamento'), iPd = idx('datapagamento', 'datapagto', 'paiddate'), iE = idx('empresa', 'company', 'entidade')
    const hasHeader = iU >= 0 && iV >= 0
    const data = hasHeader ? matrix.slice(1) : matrix

    const parsed: PRow[] = []
    for (const f of data) {
      const g = (i: number) => (i >= 0 ? (f[i] || '').trim() : '')
      const uCode = g(iU), emp = g(iE), cat = g(iC), sup = g(iF), proj = g(iP), cc = g(iCC).toUpperCase(), doc = g(iD), desc = g(iDe)
      const stRaw = norm(g(iSt)), paid = g(iPd)
      const payment_status = (stRaw === 'pago' || stRaw === 'paid') ? 'PAID' : 'ACCRUED'
      if (!uCode && !cat && !g(iV)) continue
      const yr = parseInt(g(iA)) || year
      const mo = parseInt(g(iM)) || month
      const val = parseValor(g(iV))
      const resolved = resolveUnit(uCode, emp)
      const unit = resolved.unit
      const s = findSup(sup) as any
      const p = findProj(proj)
      // Herança do cadastro do fornecedor: categoria e tratamento vêm do fornecedor quando
      // não informados no arquivo (CSV enxuto). A coluna só sobrepõe quando preenchida.
      const c = cat ? findCat(cat) : (s?.category_id ? categories.find(x => x.id === s.category_id) : undefined)
      const effClass = cc || (s?.cost_class ? String(s.cost_class).toUpperCase() : '')
      const errs: string[] = []
      if (!unit) errs.push(resolved.err || `unidade/CC "${uCode}" não encontrada`)
      else {
        if (countryId && unit.country_id !== countryId) errs.push('unidade não pertence ao país selecionado')
        if (scope === 'UNIT' && unit.id !== unitId) errs.push('unidade diferente da selecionada')
      }
      if (cat && !c) errs.push(`categoria "${cat}" não encontrada`)
      else if (!c) errs.push(sup ? `fornecedor "${sup}" sem categoria no cadastro — informe a coluna categoria` : 'sem categoria (informe fornecedor cadastrado ou a coluna categoria)')
      if (isNaN(val)) errs.push('valor inválido')
      if (!(mo >= 1 && mo <= 12)) errs.push('mês inválido')
      if (effClass && !['CAPEX', 'OPEX', 'OTC'].includes(effClass)) errs.push(`tratamento "${effClass}" inválido`)

      parsed.push({
        unit_code: uCode, cat, sup, proj, cc, doc, desc, year: yr, month: mo, value: isNaN(val) ? 0 : val,
        unit_id: unit?.id, category_id: c?.id, supplier_id: s?.id, project_id: p?.id, cost_class: effClass || undefined,
        payment_status, paid_date: paid || undefined,
        error: errs.length ? errs.join('; ') : undefined,
      })
    }
    setRows(parsed)
    e.target.value = ''
  }

  const valid = rows.filter(r => !r.error)
  const invalid = rows.filter(r => r.error)
  const total = valid.reduce((s, r) => s + r.value, 0)
  const unitsCovered = new Set(valid.map(r => r.unit_id)).size

  async function doImport() {
    if (valid.length === 0) return
    setImporting(true); setMsg(null)
    const payload = {
      country_id: countryId, unit_id: scope === 'UNIT' ? unitId : null, scope, year, month, filename: fileName,
      rows: valid.map(r => ({
        unit_id: r.unit_id, category_id: r.category_id, supplier_id: r.supplier_id || null,
        year: r.year, month: r.month, value: r.value, project_id: r.project_id || null,
        cost_class: r.cost_class || null, doc_ref: r.doc || null, note: r.desc || null,
        payment_status: r.payment_status || 'ACCRUED', paid_date: r.paid_date || null,
      })),
    }
    const res = await fetch('/api/actual/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const d = await res.json().catch(() => ({}))
    if (res.ok) {
      setMsg({ type: 'ok', text: `Importado — ${d.saved} lançamento(s) gravado(s)${d.errors ? `, ${d.errors} com erro` : ''}.` })
      setRows([]); setFileName(''); loadBatches()
    } else setMsg({ type: 'err', text: d.error || 'Erro ao importar.' })
    setImporting(false)
  }

  return (
    <div className="page">
      <div className="mb-5">
        <a href="/actual" className="text-xs text-blue-600 hover:underline">← Voltar ao Realizado</a>
        <h1 className="page-title mt-1">Importar Realizado (CSV)</h1>
        <p className="text-sm text-slate-500">Importação <b>incremental por mês</b> — cada arquivo afeta só o mês selecionado. Reimportar o mesmo mês substitui apenas aquele mês (os demais permanecem).</p>
      </div>

      {/* Regras do que está subindo */}
      <div className="card p-5 mb-5">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="label">País *</label>
            <select className="input" value={countryId} onChange={e => { setCountryId(e.target.value); setUnitId('') }}>
              <option value="">Selecione…</option>
              {countries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Escopo do arquivo *</label>
            <select className="input" value={scope} onChange={e => setScope(e.target.value as any)}>
              <option value="UNIT">Uma unidade</option>
              <option value="COUNTRY_FULL">Full — todas as unidades do país</option>
            </select>
          </div>
          {scope === 'UNIT' && (
            <div>
              <label className="label">Unidade *</label>
              <select className="input" value={unitId} onChange={e => setUnitId(e.target.value)} disabled={!countryId}>
                <option value="">Selecione…</option>
                {unitsOfCountry.map(u => <option key={u.id} value={u.id}>{u.code} — {u.name}</option>)}
              </select>
            </div>
          )}
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="label">Mês</label>
              <select className="input" value={month} onChange={e => setMonth(+e.target.value)}>
                {MONTHS_PT.map((m, i) => <option key={i + 1} value={i + 1}>{m.slice(0, 3)}</option>)}
              </select>
            </div>
            <div className="w-24">
              <label className="label">Ano</label>
              <select className="input" value={year} onChange={e => setYear(+e.target.value)}>
                {yearOptions().map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 mt-4">
          <button type="button" onClick={downloadUnidadesRef} className="btn-secondary text-sm flex items-center gap-1.5">
            <Download className="w-4 h-4" /> Unidades/CCs
          </button>
          <button type="button" onClick={downloadTemplate} className="btn-secondary text-sm flex items-center gap-1.5">
            <Download className="w-4 h-4" /> Baixar modelo CSV
          </button>
          <label className="btn-primary text-sm flex items-center gap-1.5 cursor-pointer">
            <Upload className="w-4 h-4" /> Selecionar arquivo
            <input ref={fileRef} type="file" accept=".csv,.txt,.xlsx,.xls" className="hidden" onChange={handleCSV} />
          </label>
          <span className="text-xs text-slate-400">
            Colunas: <code className="bg-slate-100 px-1 rounded">unidade, empresa, fornecedor, ano, mes, valor, tratamento, doc_ref, descricao, status, data_pagamento</code> — <b>categoria</b> e <b>tratamento</b> vêm do cadastro do fornecedor (só preencha p/ sobrepor); <b>status</b> = PAGO/PENDENTE (opcional)
          </span>
        </div>
      </div>

      {msg && (
        <div className={clsx('mb-4 flex items-center gap-2 px-4 py-2 rounded-lg text-sm', msg.type === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700')}>
          {msg.type === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />} {msg.text}
        </div>
      )}

      {/* Status do parse */}
      {fileName && (
        <div className="card p-5 mb-6">
          <div className="flex flex-wrap gap-3 mb-3">
            <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700"><b>{valid.length}</b> válidas</div>
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600"><b>{invalid.length}</b> com erro</div>
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">Total válido: <b>{BRL(total)}</b></div>
            {scope === 'COUNTRY_FULL' && <div className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-700"><b>{unitsCovered}</b> unidade(s)</div>}
            <span className="text-xs text-slate-400 self-center">{fileName}</span>
          </div>

          {invalid.length > 0 && (
            <div className="rounded-lg border border-red-100 overflow-hidden mb-3">
              <div className="px-3 py-1.5 bg-red-50 text-xs font-medium text-red-700">Linhas com erro (até 10)</div>
              <div className="divide-y divide-slate-50 max-h-40 overflow-y-auto">
                {invalid.slice(0, 10).map((r, i) => (
                  <div key={i} className="px-3 py-1.5 flex items-start gap-2 text-xs">
                    <X className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                    <span className="text-slate-600">{r.unit_code} / {r.cat}: {r.error}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary text-sm" onClick={() => { setRows([]); setFileName('') }}>Cancelar</button>
            <button type="button" className="btn-primary text-sm flex items-center gap-1.5" disabled={importing || valid.length === 0} onClick={doImport}>
              <Upload className="w-4 h-4" /> {importing ? 'Importando…' : `Importar ${valid.length} linha(s)`}
            </button>
          </div>
        </div>
      )}

      {/* Status do upload (histórico) */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">Status dos uploads</h2>
          <button onClick={loadBatches} className="p-1 text-slate-400 hover:text-slate-700"><RefreshCw className="w-4 h-4" /></button>
        </div>
        <div className="overflow-x-auto">
          <table className="tbl w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-xs font-medium text-slate-500">
                <th className="text-left px-4 py-2">Data</th>
                <th className="text-left px-4 py-2">Arquivo</th>
                <th className="text-left px-4 py-2">País</th>
                <th className="text-left px-4 py-2">Escopo</th>
                <th className="text-left px-4 py-2">Período</th>
                <th className="text-center px-4 py-2">OK</th>
                <th className="text-center px-4 py-2">Erros</th>
                <th className="text-center px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {batches.length === 0 && <tr><td colSpan={8} className="px-4 py-6 text-center text-slate-400">Nenhum upload ainda</td></tr>}
              {batches.map(b => (
                <tr key={b.id} className="hover:bg-slate-50 text-xs">
                  <td className="px-4 py-2 text-slate-500">{new Date(b.created_at).toLocaleString('pt-BR')}</td>
                  <td className="px-4 py-2 text-slate-700">{b.filename || '—'}</td>
                  <td className="px-4 py-2 text-slate-600">{b.country_name || '—'}</td>
                  <td className="px-4 py-2 text-slate-600">{b.scope === 'COUNTRY_FULL' ? 'País inteiro' : (b.unit_code || 'Unidade')}</td>
                  <td className="px-4 py-2 text-slate-600">{MONTHS_PT[b.month - 1]?.slice(0, 3)}/{b.year}</td>
                  <td className="px-4 py-2 text-center text-emerald-700 font-medium">{b.rows_ok}</td>
                  <td className="px-4 py-2 text-center text-red-600">{b.rows_err}</td>
                  <td className="px-4 py-2 text-center">
                    <span className={clsx('px-2 py-0.5 rounded-full text-[10px] font-medium', b.status === 'CONCLUIDO' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600')}>{b.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
