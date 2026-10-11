// Helpers de CSV/planilha para os cadastros (parse tolerante + download de modelo).
export const norm = (s: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
export const normH = (s: string) => norm(s).replace(/[\s_]+/g, '')

// separa uma linha de texto respeitando aspas duplas
function splitLine(line: string, delim: string): string[] {
  const out: string[] = []; let cur = '', inQ = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i++ } else inQ = !inQ }
    else if (c === delim && !inQ) { out.push(cur); cur = '' }
    else cur += c
  }
  out.push(cur); return out.map(s => s.trim().replace(/^"|"$/g, ''))
}

// texto CSV/TSV → matriz de células (detecta , ; ou tab pelo cabeçalho)
function textToMatrix(text: string): string[][] {
  const clean = String(text || '').replace(/^﻿/, '')
  const lines = clean.split(/\r?\n/).filter(l => l.trim() !== '')
  if (!lines.length) return []
  const head = lines[0]
  const delim = head.split(';').length > head.split(',').length ? ';'
    : head.split('\t').length > head.split(',').length ? '\t' : ','
  return lines.map(l => splitLine(l, delim))
}

export function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const m = textToMatrix(text)
  if (!m.length) return { headers: [], rows: [] }
  return { headers: m[0].map(normH), rows: m.slice(1) }
}

// Lê um arquivo CSV/TXT ou XLSX/XLS e devolve a matriz bruta de células
// (o cabeçalho fica na 1ª linha). O xlsx é carregado sob demanda.
export async function readMatrix(file: File): Promise<string[][]> {
  const name = (file.name || '').toLowerCase()
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const { read, utils } = await import('xlsx')
    const wb = read(new Uint8Array(await file.arrayBuffer()), { type: 'array' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    if (!ws) return []
    const aoa = utils.sheet_to_json<any[]>(ws, { header: 1, raw: false, defval: '' }) as any[][]
    return aoa
      .map(r => (Array.isArray(r) ? r.map(c => String(c ?? '').trim()) : []))
      .filter(r => r.some(c => c !== ''))
  }
  return textToMatrix(await file.text())
}

// Igual ao parseCSV, mas aceita também XLSX: { cabeçalho normalizado, linhas }.
export async function readTable(file: File): Promise<{ headers: string[]; rows: string[][] }> {
  const m = await readMatrix(file)
  if (!m.length) return { headers: [], rows: [] }
  return { headers: m[0].map(normH), rows: m.slice(1) }
}

export function csvDownload(filename: string, header: string, rows: string[]) {
  const blob = new Blob(['﻿' + [header, ...rows].join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob); a.download = filename; a.click()
}
