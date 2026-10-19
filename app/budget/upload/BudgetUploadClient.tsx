'use client'
import { useState, useRef, useEffect } from 'react'
import { Upload, CheckCircle2, AlertTriangle, FileSpreadsheet, X, Plus, Download, Gauge } from 'lucide-react'
import { MONTHS_PT } from '@/lib/types'
import { yearOptions, DEFAULT_YEAR } from '@/lib/years'

const BRL = (n: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 }).format(n)

interface Props {
  units: any[]
  categories: any[]
  suppliers: any[]
  currencies: any[]
  services?: { supplier_id: string; category_id: string | null; cost_class: string | null; unit_id: string | null }[]
}

interface BudgetRow {
  unit_id: string
  category_id: string
  amount: string
}

// Linha lida do CSV, já resolvida/validada
interface CsvRow {
  unit_code: string
  cat_code: string
  supplier_code: string
  currency: string
  kpi: string
  descricao: string
  cost_class?: string
  year: number
  month: number
  value: number
  unit_id?: string
  category_id?: string
  supplier_id?: string
  error?: string
  warn?: string
}

// nomes de mês para o layout largo (jan..dez)
const MONTH_ABBR = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

// ── helpers ────────────────────────────────────────────────
const stripAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
const norm = (s: string) => stripAccents(String(s || '')).toLowerCase().trim()
const normHeader = (s: string) => norm(s).replace(/[\s_]+/g, '')

// separa uma linha CSV respeitando aspas duplas
function splitLine(line: string, delim: string): string[] {
  const out: string[] = []
  let cur = '', inQ = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++ } else inQ = !inQ
    } else if (c === delim && !inQ) { out.push(cur); cur = '' }
    else cur += c
  }
  out.push(cur)
  return out.map(s => s.trim().replace(/^"|"$/g, ''))
}

// converte texto de valor (aceita 1.234,56 / 1234.56 / 1234,56) em número
function parseValor(raw: string): number {
  let s = String(raw).replace(/[^0-9.,-]/g, '')
  if (s.includes('.') && s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.')          // pt-BR: ponto = milhar, vírgula = decimal
  } else if (s.includes(',')) {
    s = s.replace(',', '.')                               // vírgula decimal
  }
  const n = parseFloat(s)
  return isNaN(n) ? NaN : n
}

function parseMonth(raw: string): number {
  const n = parseInt(raw)
  if (n >= 1 && n <= 12) return n
  const i = MONTHS_PT.findIndex(m => norm(m) === norm(raw))
  return i >= 0 ? i + 1 : 0
}

export default function BudgetUploadClient({ units, categories, suppliers, currencies, services = [] }: Props) {
  const now = new Date()
  const [years, setYears] = useState<number[]>(yearOptions())
  const [year, setYear] = useState(DEFAULT_YEAR)
  const [month, setMonth] = useState(now.getMonth() + 1)
  function addNextYear() {
    setYears(ys => {
      const next = Math.max(...ys) + 1
      setYear(next)
      return ys.includes(next) ? ys : [...ys, next]
    })
  }
  const [rows, setRows] = useState<BudgetRow[]>([{ unit_id: '', category_id: '', amount: '' }])
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  // estado do import CSV
  const [csvRows, setCsvRows] = useState<CsvRow[]>([])
  const [csvName, setCsvName] = useState('')
  const [importing, setImporting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Gating (Fase 2): checa a prontidão dos cadastros antes de orçar
  const [gate, setGate] = useState<{ budget: boolean; miss: string[] } | null>(null)
  useEffect(() => {
    fetch('/api/readiness').then(r => r.json()).then(d => {
      if (!d || d.error) return
      const miss: string[] = []
      if (!(d.unidades > 0)) miss.push('Unidades')
      if (!(d.units > 0)) miss.push('Centro de Custo')
      if (!(d.categories > 0)) miss.push('Categorias')
      setGate({ budget: !!d.gates?.budget, miss })
    }).catch(() => {})
  }, [])

  const findUnit = (v: string) => {
    const k = norm(v)
    return units.find(u => norm(u.code) === k) || units.find(u => norm(u.name) === k)
  }
  // mapa Unidade (nome) → CCs, para resolver o CC pela unidade quando o arquivo não trouxer o CC
  const unidadeMap: Record<string, any[]> = {}
  for (const u of units) { const k = norm(u.unidade_nome || ''); if (k) (unidadeMap[k] ||= []).push(u) }
  // Resolve a célula para 1 CC: tenta CÓDIGO DO CC; senão, NOME DA UNIDADE (1 CC = automático;
  // vários = ambíguo, precisa da empresa/CC). `empresa` desempata dentro da unidade.
  const resolveUnit = (v: string, empresa?: string): { unit?: any; err?: string } => {
    const direct = findUnit(v)
    if (direct) return { unit: direct }
    const ccs = unidadeMap[norm(v)]
    if (ccs && ccs.length) {
      if (empresa) { const m = ccs.find(c => norm(c.code).includes(norm(empresa)) || norm(c.name).includes(norm(empresa))); if (m) return { unit: m }; return { err: `empresa "${empresa}" não encontrada na unidade "${v}"` } }
      if (ccs.length === 1) return { unit: ccs[0] }
      return { err: `unidade "${v}" tem ${ccs.length} CCs — informe a coluna "empresa" (ou o centro_custo)` }
    }
    return {}
  }
  const findCat = (v: string) => {
    const k = norm(v)
    return categories.find(c => norm(c.code) === k) || categories.find(c => norm(c.name) === k)
  }
  const findSupplier = (v: string) => {
    const k = norm(v)
    if (!k) return null
    return suppliers.find(s => norm(s.short_name) === k) || suppliers.find(s => norm(s.name) === k) || null
  }
  const findCurrency = (v: string) => {
    const k = norm(v)
    if (!k) return null
    return currencies.find(c => norm(c.code) === k) || currencies.find(c => norm(c.name) === k) || null
  }

  // ── manual ──────────────────────────────────────────────
  function addRow() { setRows(r => [...r, { unit_id: '', category_id: '', amount: '' }]) }
  function removeRow(i: number) { setRows(r => r.filter((_, idx) => idx !== i)) }
  function updateRow(i: number, field: keyof BudgetRow, value: string) {
    setRows(r => r.map((row, idx) => (idx === i ? { ...row, [field]: value } : row)))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const valid = rows.filter(r => r.unit_id && r.category_id && r.amount)
    if (valid.length === 0) { setMsg({ type: 'err', text: 'Preencha ao menos uma linha completa.' }); return }
    setSaving(true); setMsg(null)
    const payload = {
      year,
      rows: valid.map(r => ({
        unit_id: r.unit_id,
        category_id: r.category_id,
        year,
        month,
        value: parseFloat(r.amount.replace(',', '.')),
      })),
    }
    const res = await fetch('/api/budget', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      setMsg({ type: 'ok', text: `Orçamento salvo — ${data.saved} linha(s) inserida(s)${data.errors ? `, ${data.errors} com erro` : ''}.` })
      setRows([{ unit_id: '', category_id: '', amount: '' }])
    } else {
      setMsg({ type: 'err', text: data.error || 'Erro ao salvar orçamento.' })
    }
    setSaving(false)
  }

  // ── Modelo CSV canônico (imposto pelo sistema, NÃO cartesiano) ──
  // Uma linha = Centro de Custo + Categoria + Fornecedor + os 12 meses.
  // Cabeçalho: centro_custo,categoria,fornecedor,moeda,kpi,descricao,jan..dez
  function downloadTemplate() {
    const esc = (s: string) => /[",;\n]/.test(s) ? `"${String(s).replace(/"/g, '""')}"` : String(s)
    // CSV enxuto: 'unidade' é a chave (o sistema acha o CC); 'fornecedor' traz categoria e
    // tratamento do cadastro automaticamente. 'empresa' só quando a unidade tem vários CCs.
    // 'categoria' e 'tratamento' são OPCIONAIS — só preencha para sobrepor o cadastro.
    const header = ['unidade', 'empresa', 'fornecedor', 'moeda', 'kpi', 'descricao', 'tratamento', ...MONTH_ABBR].join(',')
    const lines: string[] = [header]
    const uEx = units[0]?.unidade_nome || units[0]?.code || 'Guarulhos I'
    const fEx = suppliers[0]?.short_name || suppliers[0]?.name || 'Embratel'
    const moEx = currencies.find(c => norm(c.code) === 'brl')?.code || currencies[0]?.code || 'BRL'
    lines.push([uEx, '', esc(fEx), moEx, 'Link Internet', 'Categoria e tratamento vêm do cadastro do fornecedor', '', '1000', '1000', '1000', '1000', '1000', '1000', '1000', '1000', '1000', '1000', '1000', '1000'].map(esc).join(','))
    lines.push([uEx, '', esc(fEx), moEx, '', 'Linha com tratamento sobreposto (OTC)', 'OTC', '500', '500', '500', '500', '500', '500', '500', '500', '500', '500', '500', '500'].map(esc).join(','))
    dl(`modelo_orcamento_${year}.csv`, lines.join('\r\n'))
  }
  const esc = (s: any) => { const v = String(s ?? ''); return /[",;\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v }
  function dl(name: string, content: string) {
    const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); URL.revokeObjectURL(a.href)
  }
  // agrupa CCs por unidade (para o exemplo e a referência)
  const unidadeGroups = (() => { const m: Record<string, string[]> = {}; for (const u of units) { const n = u.unidade_nome || 'Sem unidade'; (m[n] ||= []).push(u.code) } return m })()
  function downloadExample() {
    const uni1 = Object.entries(unidadeGroups).find(([, c]) => c.length === 1)?.[0] || units[0]?.code || 'Guarulhos I'
    const ccMulti = Object.values(unidadeGroups).find(c => c.length > 1)?.[0] || units[0]?.code || 'FG-PNG | TI'
    const forn = suppliers[0]?.short_name || suppliers[0]?.name || 'Fornecedor'
    const mo = currencies.find(c => norm(c.code) === 'brl')?.code || currencies[0]?.code || 'BRL'
    const t = (v: string) => Array(12).fill(v)
    const header = ['unidade', 'empresa', 'fornecedor', 'moeda', 'kpi', 'descricao', 'tratamento', ...MONTH_ABBR]
    const lines = [header.join(','),
      [uni1, '', forn, mo, 'KPI opcional', 'Exemplo: unidade de 1 CC (use o NOME); categoria/tratamento do cadastro', '', ...t('1000')].map(esc).join(','),
      [ccMulti, '', forn, mo, '', 'Exemplo: unidade multi-CC (use o CODIGO do CC)', '', ...t('500')].map(esc).join(','),
    ].join('\r\n')
    dl(`exemplo_orcamento_${year}.csv`, lines)
  }
  function downloadUnidadesRef() {
    const header = 'unidade,qtd_ccs,como_preencher,centros_de_custo'
    const lines = [header, ...Object.entries(unidadeGroups).sort((a, b) => a[0].localeCompare(b[0])).map(([n, codes]) =>
      [n, String(codes.length), codes.length === 1 ? 'usar NOME da unidade' : 'usar CODIGO do CC', codes.join(' | ')].map(esc).join(','))]
    dl('referencia_unidades.csv', lines.join('\r\n'))
  }

  // ── Parser comum (matriz de células → linhas validadas) ──
  // Suporta dois layouts:
  //  • LARGO (canônico): uma linha por CC+categoria+fornecedor, com 12 colunas jan..dez
  //  • LONGO: uma linha por mês (colunas mes, valor)
  function processMatrix(rows: string[][]) {
    if (rows.length === 0) { setCsvRows([]); return }

    const cells0 = rows[0].map(normHeader)
    const idxOf = (...keys: string[]) => cells0.findIndex(h => keys.includes(h))
    let iU = idxOf('unidade', 'centrocusto', 'codigocentrocusto', 'codigounidade', 'codunidade', 'unit', 'unitcode', 'cc', 'site', 'filial')
    let iC = idxOf('categoria', 'codigocategoria', 'codcategoria', 'category', 'categorycode', 'descricaogeral')
    const iF = idxOf('fornecedor', 'codigofornecedor', 'supplier')
    const iE = idxOf('empresa', 'company', 'entidade')
    const iMo = idxOf('moeda', 'currency')
    const iK = idxOf('kpi')
    const iD = idxOf('descricao', 'description', 'descr')
    const iCC = idxOf('capexopex', 'capex', 'opex', 'costclass', 'tratamento', 'classe')
    let iM = idxOf('mes', 'month')
    let iV = idxOf('valor', 'value', 'amount')

    // colunas de mês (layout largo): jan..dez (aceita "jan", "jan/27", "janeiro" etc.)
    const monthCols = MONTH_ABBR.map(m => cells0.findIndex(h => h === m || h.startsWith(m)))
    const wideCount = monthCols.filter(i => i >= 0).length
    const isWide = wideCount >= 6

    const hasHeader = iU >= 0 && (iV >= 0 || isWide)   // categoria agora é opcional (herda do fornecedor)

    let dataRows = rows
    if (hasHeader) {
      dataRows = rows.slice(1)
    } else {
      // sem cabeçalho reconhecível → posicional (CC, categoria, mes, valor)
      const n = rows[0].length
      if (n >= 4) { iU = 0; iC = 1; iM = 2; iV = 3 }
      else { iU = 0; iC = 1; iV = 2; iM = -1 }  // 3 colunas: usa mês do seletor
    }

    const parsed: CsvRow[] = []
    for (const f of dataRows) {
      const uCode = (f[iU] || '').trim()
      const cCode = (f[iC] || '').trim()
      const fRaw = iF >= 0 ? (f[iF] || '').trim() : ''
      const moRaw = iMo >= 0 ? (f[iMo] || '').trim() : ''
      const kpi = iK >= 0 ? (f[iK] || '').trim() : ''
      const desc = iD >= 0 ? (f[iD] || '').trim() : ''
      const ccRaw = iCC >= 0 ? (f[iCC] || '').trim().toUpperCase() : ''
      if (!uCode && !cCode && !fRaw) continue

      const empresa = iE >= 0 ? (f[iE] || '').trim() : ''
      const resolved = resolveUnit(uCode, empresa)
      const unit = resolved.unit
      const sup = fRaw ? findSupplier(fRaw) : null
      // Herança do SERVIÇO: categoria e tratamento vêm do serviço do fornecedor quando não
      // informados (CSV enxuto). 1 serviço herda direto; vários exigem a coluna categoria.
      const svcList = sup ? services.filter(v => v.supplier_id === sup.id) : []
      const cat = cCode ? findCat(cCode)
        : (svcList.length === 1 && svcList[0].category_id ? categories.find((x: any) => x.id === svcList[0].category_id) : null)
      const matchedSvc = (cat ? svcList.find(v => v.category_id === cat.id) : undefined) || (svcList.length === 1 ? svcList[0] : undefined)
      const effClass = ccRaw || (matchedSvc?.cost_class ? String(matchedSvc.cost_class).toUpperCase() : '')
      const cost_class = ['CAPEX', 'OPEX', 'OTC'].includes(effClass) ? effClass : undefined
      const cur = moRaw ? findCurrency(moRaw) : null

      // erros de dimensão (BLOQUEIAM a linha): CC/unidade, categoria, moeda
      const dimErrs: string[] = []
      if (!unit) dimErrs.push(resolved.err || `Unidade/Centro de Custo "${uCode || '(vazio)'}" não encontrado no cadastro`)
      if (cCode && !cat) dimErrs.push(`categoria "${cCode}" não existe no cadastro`)
      else if (!cat) dimErrs.push(fRaw ? (svcList.length > 1 ? `fornecedor "${fRaw}" tem ${svcList.length} serviços — informe a coluna categoria` : `fornecedor "${fRaw}" sem serviço cadastrado — informe a coluna categoria`) : 'sem categoria (informe fornecedor cadastrado ou a coluna categoria)')
      if (moRaw && !cur) dimErrs.push(`moeda "${moRaw}" não existe no cadastro`)
      // avisos (NÃO bloqueiam): fornecedor inexistente → carrega sem fornecedor (vincular depois)
      const warns: string[] = []
      if (fRaw && !sup) warns.push(`fornecedor "${fRaw}" não cadastrado — carregado sem fornecedor`)

      const mkRow = (mo: number, val: number): CsvRow => {
        const errs = [...dimErrs]
        if (!(mo >= 1 && mo <= 12)) errs.push('mês inválido')
        if (isNaN(val)) errs.push('valor inválido')
        return {
          unit_code: uCode, cat_code: cCode, supplier_code: fRaw,
          currency: cur?.code || moRaw, kpi, descricao: desc, cost_class,
          year, month: mo, value: isNaN(val) ? 0 : val,
          unit_id: unit?.id, category_id: cat?.id, supplier_id: sup?.id,
          error: errs.length ? errs.join('; ') : undefined,
          warn: warns.length ? warns.join('; ') : undefined,
        }
      }

      if (isWide) {
        // se a linha tem erro de dimensão, mostra UMA linha de erro (não 12)
        if (dimErrs.length) {
          parsed.push({
            unit_code: uCode, cat_code: cCode, supplier_code: fRaw,
            currency: cur?.code || moRaw, kpi, descricao: desc,
            year, month: 0, value: 0,
            unit_id: unit?.id, category_id: cat?.id, supplier_id: sup?.id,
            error: dimErrs.join('; '),
          })
          continue
        }
        for (let mi = 0; mi < 12; mi++) {
          const col = monthCols[mi]
          if (col < 0) continue
          const raw = (f[col] || '').trim()
          if (raw === '') continue
          const val = parseValor(raw)
          if (isNaN(val) || val === 0) continue  // pula meses vazios/zero (sem gasto = sem linha)
          parsed.push(mkRow(mi + 1, val))
        }
      } else {
        const vRaw = (f[iV] || '').trim()
        if (!vRaw) continue
        const mo = iM >= 0 ? parseMonth(f[iM] || '') : month
        parsed.push(mkRow(mo, parseValor(vRaw)))
      }
    }
    setCsvRows(parsed)
  }

  // ── Arquivo (CSV ou XLSX, ano inteiro) ──────────────────
  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setCsvName(file.name); setMsg(null); setCsvRows([])
    const ext = (file.name.split('.').pop() || '').toLowerCase()
    const isXlsx = ext === 'xlsx' || ext === 'xls'
    const reader = new FileReader()
    reader.onload = async ev => {
      try {
        if (isXlsx) {
          const { read, utils } = await import('xlsx')
          const wb = read(new Uint8Array(ev.target?.result as ArrayBuffer), { type: 'array' })
          const ws = wb.Sheets[wb.SheetNames[0]]
          if (!ws) { setMsg({ type: 'err', text: 'A planilha não tem nenhuma aba.' }); return }
          const aoa = utils.sheet_to_json<any[]>(ws, { header: 1, raw: false, defval: '' })
          const matrix = aoa
            .map(r => (Array.isArray(r) ? r.map(c => String(c ?? '').trim()) : []))
            .filter(r => r.some(c => c !== ''))
          processMatrix(matrix)
        } else {
          const text = String(ev.target?.result || '').replace(/^﻿/, '')
          const allLines = text.split(/\r?\n/).filter(l => l.trim() !== '')
          if (allLines.length === 0) { setCsvRows([]); return }
          // detecta separador
          const head = allLines[0]
          const delim = (head.split(';').length > head.split(',').length) ? ';'
            : (head.split('\t').length > head.split(',').length) ? '\t' : ','
          processMatrix(allLines.map(l => splitLine(l, delim)))
        }
      } catch {
        setCsvRows([])
        setMsg({ type: 'err', text: 'Não foi possível ler o arquivo. Verifique se é um CSV ou XLSX válido.' })
      }
    }
    if (isXlsx) reader.readAsArrayBuffer(file)
    else reader.readAsText(file)
    e.target.value = ''
  }

  async function importCSV() {
    const valid = csvRows.filter(r => !r.error)
    if (valid.length === 0) return
    if (!confirm(`Isto substitui TODO o orçamento de ${year} pelo conteúdo deste arquivo (${csvValid.length} linha(s)). Continuar?`)) return
    setImporting(true); setMsg(null)
    const payload = {
      year,
      mode: 'replace_year',
      rows: valid.map(r => ({
        unit_id: r.unit_id, category_id: r.category_id, supplier_id: r.supplier_id || null,
        year, month: r.month, value: r.value,
        descricao: r.descricao || null, kpi: r.kpi || null, currency: r.currency || null,
        cost_class: r.cost_class || null,
      })),
    }
    const res = await fetch('/api/budget', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      setMsg({ type: 'ok', text: `Orçamento de ${year} substituído — ${data.saved} linha(s) gravada(s)${data.errors ? `, ${data.errors} com erro` : ''}.` })
      setCsvRows([]); setCsvName('')
    } else {
      setMsg({ type: 'err', text: data.error || 'Erro ao importar CSV.' })
    }
    setImporting(false)
  }

  const csvValid = csvRows.filter(r => !r.error)
  const csvInvalid = csvRows.filter(r => r.error)
  const csvWarn = csvValid.filter(r => r.warn)
  const csvTotal = csvValid.reduce((s, r) => s + r.value, 0)
  const total = rows.reduce((s, r) => s + (parseFloat(r.amount.replace(',', '.')) || 0), 0)

  return (
    <div className="page">
      <div className="mb-6">
        <h1 className="page-title">Upload de Orçamento</h1>
        <p className="text-sm text-slate-500">O orçamento é sempre do <b>ano inteiro</b> (todas as unidades, categorias e os 12 meses em um único arquivo). Escolha o <b>ano de destino</b> ou use <b>+ ano</b> para incluir um ano novo subsequente.</p>
      </div>

      {gate && !gate.budget && (
        <div className="mb-5 flex items-start gap-3 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
          <Gauge className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="text-sm">
            <b>Cadastros incompletos para orçar.</b> Falta: {gate.miss.join(', ')}. As linhas que dependem deles serão barradas no preview.
            {' '}<a href="/prontidao" className="underline font-medium">Ver Prontidão</a>.
          </div>
        </div>
      )}

      {/* Import CSV (ano inteiro) */}
      <div className="card p-5 mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="font-semibold text-slate-800 flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-blue-500" /> Importar planilha — CSV ou XLSX (ano inteiro)
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Aceita <b>.csv</b> e <b>.xlsx</b>. Modelo do sistema — uma linha por lançamento:
              <code className="bg-slate-100 px-1 rounded">unidade, empresa, fornecedor, moeda, kpi, descricao, tratamento, jan … dez</code>
              (<b>categoria</b> e <b>tratamento</b> vêm do cadastro do fornecedor — só preencha p/ sobrepor; moeda, kpi e descrição opcionais; meses vazios/zero são ignorados).
              O <b>preview</b> valida contra os cadastros e aponta o que não existe (Centro de Custo, categoria, fornecedor, moeda) <b>antes</b> de gravar.
              Clique em <b>Baixar modelo</b> para o CSV com o cabeçalho e exemplos. O <b>ano de destino</b> é o selecionado ao lado.
            </p>
          </div>
          <div className="flex items-end gap-2 shrink-0">
            <div>
              <label className="label">Ano de destino</label>
              <div className="flex items-center gap-1.5">
                <select className="input w-24 text-sm" value={year} onChange={e => setYear(+e.target.value)}>
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <button type="button" onClick={addNextYear} title="Incluir próximo ano"
                  className="btn-secondary text-sm flex items-center gap-1 px-2">
                  <Plus className="w-4 h-4" /> ano
                </button>
              </div>
            </div>
            <button type="button" onClick={downloadTemplate} className="btn-secondary flex items-center gap-1.5 text-sm">
              <Download className="w-4 h-4" /> Baixar modelo
            </button>
            <button type="button" onClick={downloadExample} className="btn-secondary flex items-center gap-1.5 text-sm">
              <Download className="w-4 h-4" /> Exemplo preenchido
            </button>
            <button type="button" onClick={downloadUnidadesRef} className="btn-secondary flex items-center gap-1.5 text-sm">
              <Download className="w-4 h-4" /> Unidades/CCs
            </button>
            <label className="btn-primary cursor-pointer flex items-center gap-1.5 text-sm">
              <Upload className="w-4 h-4" /> Selecionar arquivo
              <input ref={fileRef} type="file" accept=".csv,.txt,.xlsx,.xls" className="hidden" onChange={handleFile} />
            </label>
          </div>
        </div>

        {csvName && (
          <div className="mt-4">
            <div className="flex flex-wrap gap-3 mb-3">
              <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span className="text-sm text-emerald-700"><b>{csvValid.length}</b> válidas</span>
              </div>
              <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                <span className="text-sm text-red-600"><b>{csvInvalid.length}</b> com erro</span>
              </div>
              {csvWarn.length > 0 && (
                <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  <span className="text-sm text-amber-600"><b>{csvWarn.length}</b> sem fornecedor (carregam mesmo assim)</span>
                </div>
              )}
              <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2">
                <span className="text-sm text-slate-600">Total válido: <b>{BRL(csvTotal)}</b></span>
              </div>
              <span className="text-xs text-slate-400 self-center">{csvName}</span>
            </div>

            {csvInvalid.length > 0 && (
              <div className="rounded-lg border border-red-100 overflow-hidden mb-3">
                <div className="px-3 py-1.5 bg-red-50 text-xs font-medium text-red-700">
                  Linhas com erro (não serão importadas) — mostrando até 10
                </div>
                <div className="divide-y divide-slate-50 max-h-40 overflow-y-auto">
                  {csvInvalid.slice(0, 10).map((r, i) => (
                    <div key={i} className="px-3 py-1.5 flex items-start gap-2 text-xs">
                      <X className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                      <span className="text-slate-600">
                        {r.unit_code} / {r.cat_code}{r.supplier_code ? ` / ${r.supplier_code}` : ''} / {r.month >= 1 && r.month <= 12 ? MONTHS_PT[r.month - 1] : '?'}: {r.error}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary text-sm" onClick={() => { setCsvRows([]); setCsvName('') }}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn-primary text-sm flex items-center gap-1.5"
                disabled={importing || csvValid.length === 0}
                onClick={importCSV}
              >
                <Upload className="w-4 h-4" />
                {importing ? 'Importando…' : `Importar ${csvValid.length} linha(s)`}
              </button>
            </div>
          </div>
        )}
      </div>

      {msg && (
        <div className={`mb-4 flex items-center gap-2 px-4 py-2 rounded-lg text-sm ${msg.type === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
          {msg.type === 'ok' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
          {msg.text}
        </div>
      )}

      <div className="card p-4 text-sm text-slate-500 flex items-start gap-2">
        <FileSpreadsheet className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
        <span>A carga <b>substitui todo o orçamento do ano</b> selecionado pelo conteúdo do arquivo — cada linha do arquivo vira uma linha do orçamento (itens distintos com mesma unidade/categoria/fornecedor coexistem). Para corrigir, ajuste o arquivo do ano e reimporte: o total gravado bate exatamente com o arquivo.</span>
      </div>
    </div>
  )
}
