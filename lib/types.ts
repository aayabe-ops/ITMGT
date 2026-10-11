export type UserRole = 'admin' | 'unit_viewer'
export type ActualOrigin = 'DIRETO' | 'RATEADO_ORIGEM' | 'RATEADO_ADM'

export interface Unit {
  id: string
  code: string
  name: string
  type: 'OP' | 'ADM'
  is_active: boolean
}

export interface Category {
  id: string
  code: string
  name: string
  is_active: boolean
}

export interface Supplier {
  id: string
  cnpj: string | null
  name: string
  short_name: string | null
  is_active: boolean
}

export interface BudgetLine {
  id: string
  unit_id: string
  category_id: string
  year: number
  month: number
  value: number
  version: number
  is_active: boolean
}

export interface ActualLine {
  id: string
  unit_id: string
  category_id: string
  supplier_id: string | null
  year: number
  month: number
  value: number
  origin: ActualOrigin
  source: string
  doc_ref: string | null
  note: string | null
  created_at: string
}

export interface RateioCriteria {
  id: string
  supplier_id: string | null
  category_id: string | null
  driver: string
  valid_from: string
  valid_to: string | null
  is_active: boolean
  description: string | null
}

export interface BudgetVsActual {
  unit_id: string
  category_id: string
  year: number
  month: number
  budgeted: number
  actual: number
  variance: number
  variance_pct: number | null
}

export const DRIVER_TYPES = [
  { value: 'IGUAL',      label: 'Igual (divisão igualitária)' },
  { value: 'FIXO_UNIT',  label: 'Peso fixo por unidade' },
  { value: 'USR_AD',     label: 'Usuários AD' },
  { value: 'USR_SAP',    label: 'Usuários SAP' },
  { value: 'PALLET_MOV', label: 'Pallets Movimentados' },
  { value: 'TON_EMB',    label: 'Toneladas Embarcadas' },
  { value: 'AREA_M2',    label: 'Área m²' },
  { value: 'RECEITA',    label: 'Receita Bruta' },
  { value: 'ENDPOINTS',  label: 'Endpoints (PCs/notebooks)' },
  { value: 'TICKETS',    label: 'Tickets Service Desk' },
  { value: 'HRS_PROJ',   label: 'Horas de Projeto' },
  { value: 'MANUAL',     label: 'Peso manual' },
]

export const MONTHS_PT = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'
]
