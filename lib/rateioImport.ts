// Mapeamentos do importador do Excel "Rateio_TI_2027".
export const norm = (s: any) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

// Regra da planilha → kind do driver
export const REGRA_KIND: Record<string, 'EQUAL' | 'VALUE' | 'MANUAL' | 'DIRECT'> = {
  direto: 'DIRECT', igual: 'EQUAL', proporcional: 'VALUE', percentual: 'MANUAL',
}

// Premissa (PROPORCIONAL) → code do driver VALUE (seed F20)
export const PREMISSA_CODE: Record<string, string> = {
  'receita liquida': 'P_RECEITA_LIQ',
  'usuarios microsoft 365 licenciados': 'P_M365',
  'usuarios protheus por filial': 'P_PROTHEUS',
  'coletores / dispositivos moveis': 'P_COLETORES',
  'analistas stefanini alocados': 'P_STEFANINI',
  'usuarios wms korber': 'P_KORBER',
  'usuarios softexpert mysig': 'P_MYSIG',
  'usuarios salesforce': 'P_SALESFORCE',
  'computadores com agente forti': 'P_FORTI',
  'horas/chamados ams seidor': 'P_AMS_SEIDOR',
  'usuarios sap s4 nomeados': 'P_SAP_S4',
  'linhas moveis ativas': 'P_LINHAS_MOVEIS',
  'headcount ativo': 'P_HEADCOUNT',
  'uso/chamados trizzy': 'P_TRIZZY',
  'usuarios emaint': 'P_EMAINT',
  'chamados mha': 'P_MHA',
  'horas/chamados 4sys': 'P_4SYS',
  'horas/chamados ravaneda': 'P_RAVANEDA',
  'horas de melhoria korber': 'P_KORBER_MELHORIA',
  'usuarios alcis wms': 'P_ALCIS',
  'certificados sanitarios': 'P_CERT_SANIT',
}

// Resolve o code do driver a partir de (regra, premissa)
export function driverCodeFor(regra: string, premissa: string): string | null {
  const kind = REGRA_KIND[norm(regra)]
  if (!kind) return null
  if (kind === 'DIRECT') return 'DIRECT'
  if (kind === 'EQUAL') return 'EQUAL'
  if (kind === 'MANUAL') return 'MANUAL'
  // VALUE (PROPORCIONAL) → pelo texto da premissa
  return PREMISSA_CODE[norm(premissa)] || null
}

export interface ImportParticipant { cc: string; unidade?: string; valor?: number | null; qtde?: number | null; pct?: number | null; receita_liq?: number | null }
export interface ImportContract {
  ext_ref: string; supplier: string; desc?: string; empresa?: string
  regra: string; premissa: string; total?: number | null; participants: ImportParticipant[]
}
