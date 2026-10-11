'use client'
import { useState } from 'react'
import Link from 'next/link'
import { Upload, FileSpreadsheet, ArrowLeft, CheckCircle2, AlertTriangle } from 'lucide-react'
import { norm, driverCodeFor, ImportContract } from '@/lib/rateioImport'
import GuideCard from '@/components/GuideCard'
import clsx from 'clsx'

const str = (v: any) => (v == null ? '' : String(v).trim())
const numOr = (v: any) => {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/\./g, '').replace(',', '.'))
  return isFinite(n) ? n : null
}

export default function ImportRateioClient() {
  const [fileName, setFileName] = useState('')
  const [contracts, setContracts] = useState<ImportContract[]>([])
  const [report, setReport] = useState<any>(null)
  const [committed, setCommitted] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setErr(''); setReport(null); setCommitted(null); setContracts([]); setFileName(file.name)
    try {
      const { read, utils } = await import('xlsx')
      const wb = read(new Uint8Array(await file.arrayBuffer()), { type: 'array' })
      const shR = wb.Sheets['Rateio']; const shL = wb.Sheets['Listas']
      if (!shR) { setErr('Aba "Rateio" não encontrada na planilha.'); return }
      const rateio = utils.sheet_to_json<any[]>(shR, { header: 1, raw: true, defval: null }) as any[][]
      const listas = shL ? (utils.sheet_to_json<any[]>(shL, { header: 1, raw: true, defval: null }) as any[][]) : []

      // aba Listas → Receita líquida por CC (coluna E = índice 4), cabeçalho na linha 3
      const recMap: Record<string, number | null> = {}
      for (let i = 3; i < listas.length; i++) { const r = listas[i]; if (r && str(r[0])) recMap[norm(r[0])] = numOr(r[4]) }

      // aba Rateio → dados a partir da linha 6 (índice 5); cabeçalho na linha 5 (índice 4)
      const byId = new Map<string, ImportContract>()
      for (let i = 5; i < rateio.length; i++) {
        const r = rateio[i]; if (!r) continue
        const id = str(r[0]); if (!/^C\d+/i.test(id)) continue
        let c = byId.get(id)
        if (!c) { c = { ext_ref: id, supplier: str(r[1]), desc: str(r[2]), empresa: str(r[3]), regra: str(r[4]), premissa: str(r[5]), total: null, participants: [] }; byId.set(id, c) }
        const cc = str(r[6]); if (!cc) continue
        c.participants.push({ cc, unidade: str(r[7]), valor: numOr(r[8]), qtde: numOr(r[9]), pct: numOr(r[10]), receita_liq: recMap[norm(cc)] ?? null })
      }
      const list = [...byId.values()]
      for (const c of list) {
        const regra = norm(c.regra)
        if (regra === 'direto') c.total = c.participants.reduce((s, p) => s + (p.valor || 0), 0)
        else { c.total = c.participants.find(p => p.valor != null)?.valor ?? null; c.participants.forEach(p => { p.valor = null }) }
      }
      setContracts(list)
    } catch (e: any) { setErr('Falha ao ler a planilha: ' + (e?.message || e)) }
    e.target.value = ''
  }

  async function run(mode: 'preview' | 'commit') {
    if (!contracts.length) { setErr('Carregue a planilha primeiro.'); return }
    setBusy(true); setErr('')
    try {
      const res = await fetch('/api/rateio/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode, contracts }) })
      const d = await res.json()
      if (!res.ok) { setErr(d.error || 'Erro na importação.'); setBusy(false); return }
      if (mode === 'preview') { setReport(d); setCommitted(null) } else { setCommitted(d) }
    } catch (e: any) { setErr(e?.message || 'Erro.') }
    setBusy(false)
  }

  // resumo local por regra
  const byRegra = contracts.reduce((m: Record<string, number>, c) => { const k = str(c.regra).toUpperCase(); m[k] = (m[k] || 0) + 1; return m }, {})
  const totalValor = contracts.reduce((s, c) => s + (c.total || 0), 0)

  return (
    <div className="page space-y-5">
      <div>
        <Link href="/rateio" className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1 mb-1"><ArrowLeft className="w-3.5 h-3.5" /> voltar ao rateio</Link>
        <h1 className="page-title flex items-center gap-2"><FileSpreadsheet className="w-5 h-5 text-blue-600" /> Importar Rateio (Excel 2027)</h1>
        <p className="text-sm text-slate-500">Sobe os contratos e regras da planilha para o configurador, de uma vez.</p>
      </div>

      <GuideCard storageKey="/rateio/import"
        steps={[
          'Selecione o arquivo Rateio_TI_2027 (.xlsx) — o sistema lê as abas Rateio e Listas.',
          'Clique em "Analisar (preview)" para conferir o que será criado, fornecedores/CCs não encontrados e drivers.',
          'Se estiver ok, clique em "Importar" — cria/atualiza as regras por ID de contrato (reimportar é seguro).',
        ]}
        note="O importador NÃO apaga contratos que não estão na planilha; ele cria/atualiza pelo ID (C001…). Centros de custo não encontrados são reportados — alinhe o cadastro de Centro de Custo e reimporte." />

      <div className="card p-5">
        <label className="btn-primary inline-flex items-center gap-1.5 cursor-pointer">
          <Upload className="w-4 h-4" /> Selecionar planilha (.xlsx)
          <input type="file" accept=".xlsx,.xls" className="hidden" onChange={onFile} />
        </label>
        {fileName && <span className="ml-3 text-sm text-slate-600">{fileName}</span>}
        {err && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</p>}

        {contracts.length > 0 && (
          <div className="mt-4 rounded-lg border border-slate-200 p-4">
            <p className="text-sm text-slate-700">Lido: <b>{contracts.length}</b> contratos · total R$ {totalValor.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</p>
            <p className="mt-1 text-xs text-slate-500">Por regra: {Object.entries(byRegra).map(([k, v]) => `${k} (${v})`).join(' · ')}</p>
            <div className="mt-3 flex gap-2">
              <button onClick={() => run('preview')} className="btn-secondary" disabled={busy}>{busy ? 'Analisando…' : 'Analisar (preview)'}</button>
              <button onClick={() => run('commit')} className="btn-primary" disabled={busy || !report}>{busy ? 'Importando…' : 'Importar'}</button>
            </div>
            {!report && <p className="mt-2 text-[11px] text-slate-400">Rode o preview antes de importar.</p>}
          </div>
        )}
      </div>

      {report && !committed && <ReportCard title="Preview — o que será feito" r={report} tone="preview" />}
      {committed && <ReportCard title="Importação concluída" r={committed} tone="done" />}
    </div>
  )
}

function ReportCard({ title, r, tone }: { title: string; r: any; tone: 'preview' | 'done' }) {
  return (
    <div className="card p-5">
      <h2 className={clsx('text-sm font-semibold flex items-center gap-1.5 mb-3', tone === 'done' ? 'text-emerald-700' : 'text-slate-800')}>
        {tone === 'done' ? <CheckCircle2 className="w-4 h-4" /> : null}{title}
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <Stat label="Contratos" v={r.contracts} />
        <Stat label="CCs casados" v={`${r.matchedCC}/${r.participants}`} />
        {tone === 'done' && <Stat label="Criados / Atualizados" v={`${r.created} / ${r.updated}`} />}
        {tone === 'done' && <Stat label="Pesos / Bases" v={`${r.weights} / ${r.bases}`} />}
        {tone === 'preview' && <Stat label="Fornecedores a criar" v={r.suppliersToCreate?.length || 0} />}
        {tone === 'preview' && <Stat label="CCs não encontrados" v={r.unmatchedCC?.length || 0} warn={r.unmatchedCC?.length > 0} />}
      </div>
      {r.driversMissing?.length > 0 && (
        <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          <b className="flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Drivers não resolvidos ({r.driversMissing.length}):</b> {r.driversMissing.slice(0, 8).join(' · ')}{r.driversMissing.length > 8 ? '…' : ''}
        </div>
      )}
      {r.unmatchedCC?.length > 0 && (
        <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          <b>Centros de custo não encontrados ({r.unmatchedCC.length}):</b> {r.unmatchedCC.slice(0, 20).join(' · ')}{r.unmatchedCC.length > 20 ? '…' : ''}
          <p className="mt-1 text-amber-600">Cadastre/alinhe esses CCs em Centro de Custo e reimporte — os demais serão criados normalmente.</p>
        </div>
      )}
      {r.suppliersToCreate?.length > 0 && tone === 'preview' && (
        <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <b>Fornecedores que serão criados ({r.suppliersToCreate.length}):</b> {r.suppliersToCreate.slice(0, 15).join(' · ')}{r.suppliersToCreate.length > 15 ? '…' : ''}
        </div>
      )}
      {r.errors?.length > 0 && <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700"><b>Erros:</b> {r.errors.join(' · ')}</div>}
    </div>
  )
}
function Stat({ label, v, warn }: { label: string; v: any; warn?: boolean }) {
  return <div className="rounded-lg bg-slate-50 px-3 py-2"><p className="text-[11px] uppercase text-slate-400">{label}</p><p className={clsx('font-semibold tabular-nums', warn ? 'text-amber-600' : 'text-slate-800')}>{v}</p></div>
}
