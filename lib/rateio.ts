// Motor de rateio (puro, sem I/O) — compartilhado por Simular (F04) e Aplicar (F05/F06).
export interface AllocInput {
  cost: number
  driverKind: 'EQUAL' | 'VALUE' | 'MANUAL' | 'DIRECT'
  units: { unit_id: string }[]          // unidades participantes
  driverValues?: Record<string, number> // unit_id -> valor do driver (kind VALUE)
  weights?: Record<string, number>      // unit_id -> peso/percentual (MANUAL/DIRECT)
}
export interface AllocLine {
  unit_id: string
  driver_value: number   // valor do driver da unidade (base ou peso)
  pct: number            // participação em % (0..100)
  allocated: number      // valor distribuído (2 casas)
}
export interface AllocResult {
  lines: AllocLine[]
  driver_total: number   // soma dos valores do driver
  reconciled: number     // soma dos allocated (deve == cost)
  ok: boolean            // reconciliado com o custo
}

export function computeAllocation(inp: AllocInput): AllocResult {
  const { cost, driverKind, units, driverValues = {}, weights = {} } = inp
  const weightOf = (uid: string): number => {
    if (driverKind === 'EQUAL') return 1
    if (driverKind === 'VALUE') return Number(driverValues[uid] || 0)
    return Number(weights[uid] || 0) // MANUAL / DIRECT
  }
  const raw = units.map(u => ({ unit_id: u.unit_id, w: weightOf(u.unit_id) }))
  const driver_total = raw.reduce((s, r) => s + r.w, 0)
  if (driver_total <= 0) return { lines: [], driver_total: 0, reconciled: 0, ok: false }

  const lines: AllocLine[] = []
  let running = 0, lastIdx = -1
  for (const r of raw) {
    if (r.w <= 0) continue
    const pct = r.w / driver_total
    const alloc = Math.round(cost * pct * 100) / 100
    running = Math.round((running + alloc) * 100) / 100
    lastIdx = lines.length
    lines.push({ unit_id: r.unit_id, driver_value: r.w, pct: pct * 100, allocated: alloc })
  }
  // ajuste de centavo na última unidade para reconciliar com o custo original
  if (lastIdx >= 0 && running !== cost) {
    lines[lastIdx].allocated = Math.round((lines[lastIdx].allocated + (cost - running)) * 100) / 100
  }
  const reconciled = Math.round(lines.reduce((s, l) => s + l.allocated, 0) * 100) / 100
  return { lines, driver_total, reconciled, ok: reconciled === cost }
}
