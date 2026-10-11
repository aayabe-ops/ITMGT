# Monthly Actual Closing — Backlog Priorizado

> Derivado de `monthly-actual-closing-impact-assessment.md` (§16) e `monthly-actual-closing-requirements.md`.
> **Planejamento apenas — nada implementado.** Esforço em camisetas (S ≈ ½–1 dia, M ≈ 2–4 dias, L ≈ 1–2 semanas), estimativa grosseira sujeita ao design de cada IU.

## Legenda
- **Dep** = depende de. **Esforço** = S/M/L. **Valor** = benefício ao negócio ao concluir.
- Decisão de referência entre parênteses (D1–D7, L1–L4).

---

## Fase 0 — Fundação / Pré-requisitos técnicos
*Objetivo: base confiável antes de evoluir o modelo. Sem isto, tudo o resto herda risco.*

| ID | Item | Dep | Esforço | Valor |
|----|------|-----|---------|-------|
| **IU-0** | Consolidar base: **versionar no repo** `vw_budget_vs_actual` e `execute_rateio`; **confirmar migrações** recentes (hierarquia, cost_class, i18n) em produção | — | M | Schema reproduzível; fim do risco "objeto só no banco" |
| **IU-1** | **Corrigir bug do Realizado** (contrato `amount×value`, `invoice_ref×doc_ref`, `description×note`) | — | S | Realizado volta a gravar (hoje provavelmente falha) |
| **IU-11a** | **Setup de testes** (escolher/instalar framework; 1 teste de fumaça por rota crítica) | — | S | Rede de segurança para todas as fases |

---

## Fase 1 — Modelo do grão fino
*Objetivo: estabelecer o item no grão `unidade × categoria × fornecedor × projeto × mês` (D1) e o Budget compatível (D6, L3).*

| ID | Item | Dep | Esforço | Valor |
|----|------|-----|---------|-------|
| **IU-2** | **Fixar o grão fino do item** de fechamento; definir chave e view de consolidação em grão único | IU-0 | M | Base de todas as comparações item a item |
| **IU-B** | **Budget enriquecido** (`supplier_id`, `project_id`) + **processo de recarga** (fornecedor do BG2026; sem fornecedor → "A definir"; projeto nulo) | IU-2 | L | Desvio por fornecedor real; Budget no mesmo grão |
| **IU-3** | **CAPEX/OPEX** como atributo consistente do item (default do fornecedor, ajustável) | IU-2 | S | Filtro/soma por CAPEX/OPEX |

---

## Fase 2 — Estágios financeiros
*Objetivo: Comprometido, Pago e Forecast, todos transacionais e auditáveis (D2, D3, D5, L1, L2).*

| ID | Item | Dep | Esforço | Valor |
|----|------|-----|---------|-------|
| **IU-9** | **Auditoria & origem estruturada**: `data_source (MANUAL/IMPORT/SAP)`, `external_ref`, `created/updated by/at`, histórico | IU-2 | M | Rastreabilidade; pré-requisito da ingestão SAP |
| **IU-5** | **Comprometido** (manual, transacional, com referência de contrato/pedido) | IU-2, IU-9 | M | Visão Budget × Comprometido |
| **IU-4** | **Pago** (transacional, valor + data, parciais/múltiplos) | IU-2, IU-9 | M | Visão Realizado × Pago |
| **IU-6** | **Forecast** mensal por item (default = Realizado senão Budget; override + histórico; anual = soma) | IU-B, IU-4 | M | Projeção e desvio vs forecast |

---

## Fase 3 — Experiência e escopo
*Objetivo: a tela de fechamento e o controle de acesso por escopo (D7, L4).*

| ID | Item | Dep | Esforço | Valor |
|----|------|-----|---------|-------|
| **IU-SC** | **Escopo múltiplo (N:N)**: tabela `user_scopes` + ajuste da tela de Usuários (seleção múltipla) + autorização por escopo | — | M | Descentralizar o fechamento por país/unidade |
| **IU-7** | **Tela de Fechamento Mensal** consolidada: filtros Ano/Mês/Unidade/País; colunas Fornecedor, Categoria, Projeto, Plataforma, Unidade, CAPEX/OPEX, Budget, Comprometido, Realizado, Pago, Forecast, Desvio; edição por escopo | IU-B, IU-4, IU-5, IU-6, IU-SC | L | **Fechamento de ponta a ponta numa tela** |

---

## Fase 4 — Integração e qualidade
*Objetivo: preparar SAP e fechar a cobertura de testes (RNF-01, RNF-04).*

| ID | Item | Dep | Esforço | Valor |
|----|------|-----|---------|-------|
| **IU-10** | **Preparação ingestão SAP**: endpoint idempotente (upsert por chave natural + `external_id`), contrato JSON estável — **sem** integrar de fato | IU-9, IU-4/5 | M | Recebe Realizado/Pago externos sem retrabalho |
| **IU-11** | **Cobertura de testes** das regras (Desvio, Forecast, escopo, idempotência) | contínuo | M | Menos regressão; confiança para evoluir |

**Descartado nesta fase:** ~~IU-8 Workflow de status~~ (Decisão 4 — sem workflow por enquanto; modelo reserva espaço para adicionar depois).

---

## Caminho crítico e MVP

**Caminho crítico:** IU-0 → IU-2 → IU-B → IU-7. Essas quatro destravam o valor central; o resto pluga em volta.

**MVP sugerido (primeiro valor utilizável):**
IU-1 (corrigir Realizado) + IU-2 (grão fino) + IU-B (budget fino) + IU-7 reduzido (só **Budget × Realizado × Desvio** por item). Já entrega a tela de fechamento com as duas colunas mais importantes.
Depois, incrementos: **+Comprometido (IU-5)** → **+Pago (IU-4)** → **+Forecast (IU-6)** → **+Escopo (IU-SC)** → **+SAP-ready (IU-10)**.

**Sequência recomendada (ordem de execução):**
`IU-0 · IU-1 · IU-11a` → `IU-2 · IU-B · IU-3` → `IU-9 · IU-5 · IU-4 · IU-6` → `IU-SC · IU-7` → `IU-10 · IU-11`

---

## Notas de dependência importantes
- **IU-B (budget fino)** é o item mais pesado e o de maior impacto — envolve migração de `budget_lines` e recarga; convém fazer cedo e com cuidado (afeta a view de consolidação).
- **IU-9 antes dos estágios**: estruturar origem/auditoria antes de Comprometido/Pago evita retrabalho quando o SAP entrar.
- **IU-SC (escopo N:N)** substitui o escopo único que já existe no usuário — planejar migração dos dados atuais (platform_id/country_id/unit_id → `user_scopes`).
- **IU-7** só fecha quando os estágios e o escopo existirem; por isso é a última da fase de experiência.
