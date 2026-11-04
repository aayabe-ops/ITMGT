import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'

const OLLAMA_URL   = process.env.OLLAMA_URL   ?? 'http://localhost:11434'
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'qwen2.5:7b-instruct'

const money = (v: number, cur: string) => {
  try { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(v) }
  catch { return `${cur} ${Math.round(v).toLocaleString('pt-BR')}` }
}

export async function POST(req: NextRequest) {
  const user = getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const b: any = await req.json().catch(() => ({}))
  const cur: string = b.currency || 'USD'
  const year = b.year
  const mm = b.month ? String(b.month).padStart(2, '0') : ''
  const lang: 'pt' | 'es' | 'en' = ['pt', 'es', 'en'].includes(b.lang) ? b.lang : 'pt'
  const PL: Record<string, { ytd: string; month: string; year: string }> = {
    pt: { ytd: `YTD (acumulado até ${mm}/${year})`, month: `mês ${mm}/${year}`, year: `ano ${year}` },
    es: { ytd: `YTD (acumulado hasta ${mm}/${year})`, month: `mes ${mm}/${year}`, year: `año ${year}` },
    en: { ytd: `YTD (through ${mm}/${year})`, month: `month ${mm}/${year}`, year: `year ${year}` },
  }
  const periodLabel = b.period_kind === 'YTD' && mm ? PL[lang].ytd : mm ? PL[lang].month : PL[lang].year
  const byCategory = Array.isArray(b.byCategory) ? b.byCategory : []
  const bySupplier = Array.isArray(b.bySupplier) ? b.bySupplier : []
  const byCountry = Array.isArray(b.byCountry) ? b.byCountry : []
  const byCostClass = Array.isArray(b.byCostClass) ? b.byCostClass : []
  const byCurrency = Array.isArray(b.byCurrency) ? b.byCurrency : []
  const prevByCategory = Array.isArray(b.prevByCategory) ? b.prevByCategory : []

  const totBudget = byCategory.reduce((s: number, r: any) => s + Number(r.budget || 0), 0)
  const totActual = byCategory.reduce((s: number, r: any) => s + Number(r.actual || 0), 0)
  const hasActual = totActual !== 0
  const totVar = totActual - totBudget

  const m = (v: number) => money(v, cur)
  const share = (v: number) => totBudget > 0 ? `${(v / totBudget * 100).toFixed(1)}%` : '—'

  const topCat = [...byCategory].sort((a, b) => b.budget - a.budget).slice(0, 8)
    .map((c: any) => `  • ${c.name}: ${m(c.budget)} (${share(c.budget)}${hasActual ? `, realizado ${m(c.actual)}` : ''})`).join('\n')

  const totalSup = bySupplier.reduce((s: number, r: any) => s + Number(r.budget || 0), 0) || 1
  let cum = 0
  const topSup = [...bySupplier].sort((a, b) => b.budget - a.budget).slice(0, 10)
    .map((s: any) => { cum += s.budget; return `  • ${s.name}: ${m(s.budget)} (acum. ${(cum / totalSup * 100).toFixed(0)}%)` }).join('\n')

  const mix = byCostClass.map((c: any) => `${c.cost_class} ${share(c.budget)}`).join(' · ')
  const moedas = byCurrency.map((c: any) => `${c.currency_code} ${m(c.budget)}`).join(' · ')

  const prevMap = new Map(prevByCategory.map((r: any) => [r.id, Number(r.budget || 0)]))
  const yoy = byCategory.map((c: any) => ({ name: c.name, delta: c.budget - (prevMap.get(c.id) || 0) }))
    .filter((x: any) => x.delta !== 0).sort((a: any, b: any) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 6)
    .map((x: any) => `  • ${x.name}: ${x.delta >= 0 ? '+' : ''}${m(x.delta)}`).join('\n')
  const prevTotal = [...prevMap.values()].reduce((s: number, v: any) => s + v, 0)

  const focoRealizado = `Foque nos DESVIOS orçado × realizado, causas prováveis e ações corretivas.`
  const focoBudget = `Ainda não há Realizado lançado. Foque na COMPOSIÇÃO do orçamento, CONCENTRAÇÃO de fornecedores (risco de dependência) e VARIAÇÃO vs ${year - 1}.`

  const OUT: Record<string, { respond: string; concise: string; topics: string; h0: string; h1: string; h2: string; h3: string }> = {
    pt: { respond: 'Responda em português', concise: 'objetivo', topics: 'com estes tópicos em markdown', h0: 'Resumo executivo (3-4 linhas)', h1: 'Concentração e riscos (fornecedores/categorias dominantes)', h2: 'Variação vs ano anterior', h3: 'Recomendações (ações acionáveis)' },
    es: { respond: 'Responde en español', concise: 'conciso', topics: 'con estos temas en markdown', h0: 'Resumen ejecutivo (3-4 líneas)', h1: 'Concentración y riesgos (proveedores/categorías dominantes)', h2: 'Variación vs año anterior', h3: 'Recomendaciones (acciones accionables)' },
    en: { respond: 'Answer in English', concise: 'concise', topics: 'with these topics in markdown', h0: 'Executive summary (3-4 lines)', h1: 'Concentration and risks (dominant suppliers/categories)', h2: 'Variation vs previous year', h3: 'Recommendations (actionable)' },
  }

  const prompt = `Você é um controller de custos de TI. Analise o orçamento de TI (${periodLabel}), valores em ${cur}.

RESUMO
  Orçado: ${m(totBudget)}${hasActual ? ` | Realizado: ${m(totActual)} | Desvio: ${totVar >= 0 ? '+' : ''}${m(totVar)}` : ''}
  ${prevTotal > 0 ? `Orçado ${year - 1}: ${m(prevTotal)} (variação ${totBudget - prevTotal >= 0 ? '+' : ''}${m(totBudget - prevTotal)})` : ''}
  Mix por classe: ${mix || '—'}
  Por moeda: ${moedas || '—'}

TOP CATEGORIAS
${topCat || '  —'}

CONCENTRAÇÃO DE FORNECEDORES (Pareto)
${topSup || '  —'}

MAIORES VARIAÇÕES vs ${year - 1}
${yoy || '  —'}

${hasActual ? focoRealizado : focoBudget}

${OUT[lang].respond}, ${OUT[lang].concise}, ${OUT[lang].topics}:
**${OUT[lang].h0}**
**${OUT[lang].h1}**
**${OUT[lang].h2}**
**${OUT[lang].h3}**`

  try {
    const res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: OLLAMA_MODEL, prompt, stream: true, keep_alive: '15m', options: { temperature: 0.3, num_predict: 800, num_ctx: 3072 } }),
      signal: AbortSignal.timeout(600_000),
    })
    if (!res.ok || !res.body) {
      const txt = await res.text().catch(() => '')
      return NextResponse.json({ error: `Ollama erro ${res.status}: ${txt.slice(0, 200)}` }, { status: 502 })
    }
    // Converte o NDJSON do Ollama em um stream de texto puro (aparece aos poucos no client).
    const stream = new ReadableStream({
      async start(controller) {
        const reader = res.body!.getReader()
        const dec = new TextDecoder(); const enc = new TextEncoder()
        let buf = ''
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            buf += dec.decode(value, { stream: true })
            const lines = buf.split('\n'); buf = lines.pop() || ''
            for (const line of lines) {
              if (!line.trim()) continue
              try { const j = JSON.parse(line); if (j.response) controller.enqueue(enc.encode(j.response)) } catch { /* linha parcial */ }
            }
          }
        } catch { /* fim/erro de stream */ }
        controller.close()
      },
    })
    return new Response(stream, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' } })
  } catch (err: any) {
    return NextResponse.json({ error: `Ollama indisponível: ${err.message}` }, { status: 503 })
  }
}
