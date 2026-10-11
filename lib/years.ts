// Lista de anos para os seletores — janela em torno do ano atual (avança sozinho a cada ano).
export function yearOptions(): number[] {
  const y = new Date().getFullYear()
  const arr: number[] = []
  for (let i = y - 2; i <= y + 2; i++) arr.push(i) // ex.: 2026 → [2024..2028]
  return arr
}

export const DEFAULT_YEAR = new Date().getFullYear()
