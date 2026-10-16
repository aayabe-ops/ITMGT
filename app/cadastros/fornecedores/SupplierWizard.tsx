'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { X, ArrowLeft, ArrowRight, Check, Share2, CheckCircle2, AlertTriangle, Plus } from 'lucide-react'
import clsx from 'clsx'

interface Opt { id: string; name: string; code?: string }
type Props = {
  types: Opt[]; categories: Opt[]; projects: Opt[]; units: Opt[]; countries: Opt[]; solutionTypes: Opt[]; currencies: Opt[]
  onClose: () => void; onDone: () => void
}

const STEPS = ['Identificação', 'Serviço', 'Como rateia', 'Contrato', 'Revisar']
const DRAFT_KEY = 'supplier_wizard_draft'
const EMPTY_FORM = {
  name: '', short_name: '', supplier_type_id: '', country_ids: [] as string[],
  category_id: '', cost_class: 'OPEX', solution_type_id: '', project_id: '',
  expense_mode: 'DIRETO', unit_id: '',
  contract_start: '', contract_end: '', payment_due_date: '', monthly_value: '', currency_id: '',
}

// Nível de módulo (identidade estável) — se fosse definido dentro do componente,
// os inputs perderiam o foco a cada tecla.
function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-slate-400 mt-1">{hint}</p>}
    </div>
  )
}

// "Criar pré-requisito no fluxo": quando falta um cadastro-base, orienta sem travar.
function PrereqNote({ what, href }: { what: string; href: string }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-800 flex items-center justify-between gap-2">
      <span className="flex items-center gap-1.5"><AlertTriangle className="w-4 h-4 shrink-0" /> Nenhum(a) {what} cadastrado(a) ainda.</span>
      <Link href={href} className="font-medium text-amber-900 hover:underline inline-flex items-center gap-1 shrink-0">
        <Plus className="w-3.5 h-3.5" /> Criar {what}
      </Link>
    </div>
  )
}

export default function SupplierWizard({ types, categories, projects, units, countries, solutionTypes, currencies, onClose, onDone }: Props) {
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [doneId, setDoneId] = useState<string | null>(null)
  const [restored, setRestored] = useState(false)
  const [f, setF] = useState({ ...EMPTY_FORM })

  // Rascunho: restaura ao abrir, salva a cada mudança, limpa ao concluir.
  useEffect(() => {
    try { const s = localStorage.getItem(DRAFT_KEY); if (s) { const j = JSON.parse(s); if (j?.f && typeof j.f.name === 'string' && (j.f.name || j.step > 1)) { setF({ ...EMPTY_FORM, ...j.f }); setStep(Math.min(5, Math.max(1, j.step || 1))); setRestored(true) } } } catch {}
  }, [])
  useEffect(() => {
    if (doneId) return
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ f, step })) } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f, step])
  const clearDraft = () => { try { localStorage.removeItem(DRAFT_KEY) } catch {} }
  const fromScratch = () => { clearDraft(); setF({ ...EMPTY_FORM }); setStep(1); setRestored(false) }

  const set = (k: string, v: any) => setF(p => ({ ...p, [k]: v }))
  const toggleCountry = (id: string) => setF(p => ({ ...p, country_ids: p.country_ids.includes(id) ? p.country_ids.filter(x => x !== id) : [...p.country_ids, id] }))

  const isRateio = f.expense_mode === 'RATEIO'
  const catName = categories.find(c => c.id === f.category_id)?.name
  const unitLabel = units.find(u => u.id === f.unit_id)
  const curLabel = currencies.find(c => c.id === f.currency_id)

  // Validação preventiva por passo (bloqueia o "Avançar")
  function stepError(s: number): string {
    if (s === 1) {
      if (!f.name.trim()) return 'Informe o nome do fornecedor.'
      if (f.country_ids.length === 0) return 'Selecione ao menos um país atendido.'
    }
    if (s === 2) {
      if (!f.category_id) return 'Escolha a categoria — ela define o serviço e a herança para budget/realizado.'
    }
    if (s === 3) {
      if (!isRateio && !f.unit_id) return 'No modo Direto, escolha o Centro de Custo onde a despesa cai.'
    }
    if (s === 4) {
      if (f.monthly_value && !f.currency_id) return 'Informe a moeda do valor mensal.'
      if (f.contract_start && f.contract_end && f.contract_start > f.contract_end) return 'A vigência: o início não pode ser depois do fim.'
    }
    return ''
  }
  const curErr = stepError(step)
  const canNext = !curErr
  const allValid = ![1, 2, 3, 4].some(s => stepError(s))

  async function finish() {
    if (!allValid) { setErr('Há passos incompletos — revise os destaques.'); return }
    setSaving(true); setErr('')
    try {
      const sup: any = {
        name: f.name.trim(), short_name: f.short_name || null,
        supplier_type_id: f.supplier_type_id || null, category_id: f.category_id || null,
        cost_class: f.cost_class, expense_mode: f.expense_mode,
        unit_id: isRateio ? null : (f.unit_id || null),
        solution_type_id: f.solution_type_id || null, project_id: f.project_id || null,
        country_ids: f.country_ids,
        contract_start: f.contract_start || null, contract_end: f.contract_end || null, payment_due_date: f.payment_due_date || null,
      }
      const r = await fetch('/api/suppliers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sup) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok || !d.id) { setErr(d.error || 'Erro ao criar o fornecedor.'); setSaving(false); return }
      const supplierId = d.id
      // Contrato opcional: só cria se informaram valor mensal.
      if (f.monthly_value) {
        const mv = parseFloat(String(f.monthly_value).replace(/\./g, '').replace(',', '.'))
        if (isFinite(mv) && mv > 0) {
          await fetch('/api/contracts', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: `${f.short_name || f.name} — ${catName || 'Serviço'}`,
              supplier_id: supplierId, category_id: f.category_id || null, unit_id: isRateio ? null : (f.unit_id || null),
              cost_class: f.cost_class, expense_mode: f.expense_mode, monthly_value: mv, currency_id: f.currency_id || null,
              start_date: f.contract_start || null, end_date: f.contract_end || null, periodicity: 'MENSAL',
            }),
          }).catch(() => {})
        }
      }
      clearDraft()
      setDoneId(supplierId)
    } catch (e: any) { setErr(e?.message || 'Erro ao salvar.') }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-slate-800">Novo fornecedor / serviço</h2>
            <p className="text-xs text-slate-500">{doneId ? 'Concluído' : `Passo ${step} de 5 · ${STEPS[step - 1]}`}</p>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
        </div>

        {/* steps bar */}
        {!doneId && (
          <div className="px-5 pt-3 flex items-center gap-1.5">
            {STEPS.map((s, i) => (
              <div key={s} className="flex-1 flex items-center gap-1.5">
                <span className={clsx('w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0',
                  i + 1 < step ? 'bg-emerald-500 text-white' : i + 1 === step ? 'bg-navy-700 text-white' : 'bg-slate-100 text-slate-400')}>
                  {i + 1 < step ? <Check className="w-3.5 h-3.5" /> : i + 1}
                </span>
                {i < STEPS.length - 1 && <div className={clsx('h-0.5 flex-1 rounded', i + 1 < step ? 'bg-emerald-400' : 'bg-slate-100')} />}
              </div>
            ))}
          </div>
        )}

        {/* body */}
        <div className="px-5 py-5 overflow-y-auto flex-1">
          {doneId ? (
            <div className="text-center py-6">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
              <h3 className="font-semibold text-slate-800">Fornecedor criado</h3>
              <p className="text-sm text-slate-500 mt-1">{f.short_name || f.name} · {catName}</p>
              {isRateio && (
                <div className="mt-5 rounded-xl border border-violet-200 bg-violet-50/60 p-4 text-left">
                  <p className="text-sm font-medium text-violet-800 flex items-center gap-1.5"><Share2 className="w-4 h-4" /> Falta a regra de rateio</p>
                  <p className="text-xs text-violet-700/80 mt-1">Este serviço é rateado. Configure como o valor se distribui pelas unidades.</p>
                  <Link href="/rateio" className="inline-flex items-center gap-1 mt-3 text-sm font-medium text-violet-700 hover:underline">
                    Configurar regra de rateio <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              )}
              <div className="flex justify-center gap-2 mt-6">
                <button onClick={() => { setDoneId(null); setStep(1); setF({ ...EMPTY_FORM }); clearDraft() }} className="btn-secondary text-sm">Cadastrar outro</button>
                <button onClick={onDone} className="btn-primary text-sm">Concluir</button>
              </div>
            </div>
          ) : (
            <>
              {restored && (
                <div className="mb-4 rounded-lg bg-blue-50 border border-blue-100 px-3 py-2 text-xs text-blue-700 flex items-center justify-between gap-2">
                  <span>Rascunho restaurado — continue de onde parou.</span>
                  <button onClick={fromScratch} className="font-medium hover:underline shrink-0">Começar do zero</button>
                </div>
              )}
              {/* Passo 1 — Identificação */}
              {step === 1 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="sm:col-span-2"><Field label="Nome *"><input className="input" value={f.name} onChange={e => set('name', e.target.value)} placeholder="Razão social / nome" autoFocus /></Field></div>
                    <Field label="Nome curto" hint="apelido p/ telas"><input className="input" value={f.short_name} onChange={e => set('short_name', e.target.value)} /></Field>
                  </div>
                  <Field label="Tipo de fornecedor">
                    <select className="input" value={f.supplier_type_id} onChange={e => set('supplier_type_id', e.target.value)}>
                      <option value="">—</option>{types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Países atendidos *" hint="onde este fornecedor pode ter custo">
                    {countries.length === 0 ? <p className="text-xs text-amber-600">Cadastre países primeiro.</p> : (
                      <div className="flex flex-wrap gap-2">
                        {countries.map(c => {
                          const on = f.country_ids.includes(c.id)
                          return <button type="button" key={c.id} onClick={() => toggleCountry(c.id)}
                            className={clsx('px-3 py-1 rounded-full text-xs font-medium border transition-colors', on ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-400')}>
                            {c.code ? `${c.code} — ${c.name}` : c.name}</button>
                        })}
                      </div>
                    )}
                  </Field>
                </div>
              )}

              {/* Passo 2 — Classificação do serviço */}
              {step === 2 && (
                <div className="space-y-4">
                  {categories.length === 0 && <PrereqNote what="categoria" href="/cadastros/categorias" />}
                  <Field label="Categoria (serviço) *" hint="a categoria define o serviço; budget e realizado herdam dela">
                    <select className="input" value={f.category_id} onChange={e => set('category_id', e.target.value)}>
                      <option value="">Selecione…</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </Field>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Field label="Tratamento padrão" hint="editável no lançamento">
                      <select className="input" value={f.cost_class} onChange={e => set('cost_class', e.target.value)}>
                        <option value="OPEX">OPEX</option><option value="CAPEX">CAPEX</option><option value="OTC">OTC</option>
                      </select>
                    </Field>
                    <Field label="Área de TI">
                      <select className="input" value={f.solution_type_id} onChange={e => set('solution_type_id', e.target.value)}>
                        <option value="">—</option>{solutionTypes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </Field>
                    <Field label="Projeto">
                      <select className="input" value={f.project_id} onChange={e => set('project_id', e.target.value)}>
                        <option value="">—</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </Field>
                  </div>
                </div>
              )}

              {/* Passo 3 — Como o custo é tratado */}
              {step === 3 && (
                <div className="space-y-4">
                  <p className="text-sm text-slate-600">Como o custo deste serviço é tratado?</p>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { v: 'DIRETO', t: 'Direto', d: 'Cai num Centro de Custo fixo' },
                      { v: 'RATEIO', t: 'Rateio', d: 'Distribui entre várias unidades' },
                    ].map(o => (
                      <button key={o.v} type="button" onClick={() => set('expense_mode', o.v)}
                        className={clsx('text-left rounded-xl border-2 p-4 transition-colors', f.expense_mode === o.v ? 'border-navy-600 bg-navy-50/50' : 'border-slate-200 hover:border-slate-300')}>
                        <p className="font-semibold text-slate-800 text-sm">{o.t}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{o.d}</p>
                      </button>
                    ))}
                  </div>
                  {!isRateio ? (
                    units.length === 0 ? <PrereqNote what="centro de custo" href="/cadastros/centro-custo" /> : (
                    <Field label="Centro de Custo *" hint="onde a despesa direta será lançada">
                      <select className="input" value={f.unit_id} onChange={e => set('unit_id', e.target.value)}>
                        <option value="">Selecione…</option>{units.map(u => <option key={u.id} value={u.id}>{u.code} — {u.name}</option>)}
                      </select>
                    </Field>
                    )
                  ) : (
                    <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-3 text-xs text-violet-700 flex items-start gap-2">
                      <Share2 className="w-4 h-4 shrink-0 mt-0.5" />
                      A regra de rateio (forma + unidades + pesos) é configurada logo após criar o fornecedor.
                    </div>
                  )}
                </div>
              )}

              {/* Passo 4 — Contrato (opcional) */}
              {step === 4 && (
                <div className="space-y-4">
                  <p className="text-sm text-slate-500">Opcional. Preencha se já tiver os dados do contrato.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Field label="Vigência — início"><input type="date" className="input" value={f.contract_start} onChange={e => set('contract_start', e.target.value)} /></Field>
                    <Field label="Vigência — fim"><input type="date" className="input" value={f.contract_end} onChange={e => set('contract_end', e.target.value)} /></Field>
                    <Field label="Vencimento do pagamento"><input type="date" className="input" value={f.payment_due_date} onChange={e => set('payment_due_date', e.target.value)} /></Field>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="sm:col-span-2"><Field label="Valor mensal" hint="se informar, criamos o contrato automaticamente"><input className="input" value={f.monthly_value} onChange={e => set('monthly_value', e.target.value)} placeholder="0,00" /></Field></div>
                    <Field label="Moeda">
                      <select className="input" value={f.currency_id} onChange={e => set('currency_id', e.target.value)}>
                        <option value="">—</option>{currencies.map(c => <option key={c.id} value={c.id}>{c.code || c.name}</option>)}
                      </select>
                    </Field>
                  </div>
                </div>
              )}

              {/* Passo 5 — Revisar */}
              {step === 5 && (
                <div className="space-y-3">
                  <p className="text-sm text-slate-600">Confira antes de ativar.</p>
                  <dl className="rounded-xl border border-slate-100 divide-y divide-slate-50 text-sm">
                    {[
                      ['Fornecedor', f.short_name ? `${f.name} (${f.short_name})` : f.name],
                      ['Países', f.country_ids.map(id => countries.find(c => c.id === id)?.code || '').filter(Boolean).join(', ') || '—'],
                      ['Serviço (categoria)', catName || '—'],
                      ['Tratamento', f.cost_class],
                      ['Modo', isRateio ? 'Rateio (regra a configurar)' : `Direto · ${unitLabel ? `${unitLabel.code} — ${unitLabel.name}` : '—'}`],
                      ['Contrato', f.monthly_value ? `${f.monthly_value} ${curLabel?.code || ''}${f.contract_end ? ` · até ${f.contract_end}` : ''}` : '—'],
                    ].map(([k, v]) => (
                      <div key={k} className="flex items-start gap-3 px-3 py-2">
                        <dt className="text-slate-400 w-40 shrink-0">{k}</dt>
                        <dd className="text-slate-800">{v}</dd>
                      </div>
                    ))}
                  </dl>
                  {!allValid && (
                    <p className="text-xs text-amber-600 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Há passos incompletos — volte e preencha os obrigatórios.</p>
                  )}
                </div>
              )}

              {curErr && <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2 mt-4 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {curErr}</p>}
              {err && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mt-3">{err}</p>}
            </>
          )}
        </div>

        {/* footer */}
        {!doneId && (
          <div className="px-5 py-4 border-t border-slate-100 flex items-center justify-between">
            <button onClick={() => (step > 1 ? setStep(step - 1) : onClose())} className="btn-secondary text-sm flex items-center gap-1.5">
              <ArrowLeft className="w-4 h-4" /> {step > 1 ? 'Voltar' : 'Cancelar'}
            </button>
            {step < 5 ? (
              <button onClick={() => canNext && setStep(step + 1)} disabled={!canNext} className={clsx('btn-primary text-sm flex items-center gap-1.5', !canNext && 'opacity-50 cursor-not-allowed')}>
                Avançar <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button onClick={finish} disabled={saving || !allValid} className={clsx('btn-primary text-sm flex items-center gap-1.5', (saving || !allValid) && 'opacity-50 cursor-not-allowed')}>
                <Check className="w-4 h-4" /> {saving ? 'Criando…' : 'Ativar fornecedor'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
