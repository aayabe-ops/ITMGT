# Monthly Actual Closing — Requirements (Decisões de Negócio)

> Documento de **requisitos** derivado do discovery de decisões de negócio.
> Complementa `monthly-actual-closing-impact-assessment.md`.
> **Ainda não é implementação** — é a base aprovada para planejar as unidades de implementação (IU-0…IU-11).
> Data das decisões: 2026-09-18.

---

## 1. Decisões aprovadas (viram requisitos)

| # | Tema | Decisão aprovada |
|---|------|------------------|
| 1 | **Grão do fechamento** | **Fino**: `unidade × categoria × fornecedor × projeto × mês`. CAPEX/OPEX é **atributo** do item. Plataforma/País **derivados** da unidade. |
| 2 | **Comprometido** | **Manual** agora (responsável informa/atualiza por item/mês), modelo **preparado** para receber de pedido/contrato/SAP depois. |
| 3 | **Forecast** | **Híbrido**: padrão **calculado** + **editável** pelo gestor, com **histórico** de revisões. Fórmula padrão a afinar. |
| 4 | **Workflow de status** | **Não** haverá workflow nesta fase. A tela mostra apenas os **valores** (status fica para fase futura). |
| 5 | **Realizado / Pago** | **Transacional**: N lançamentos por item/mês (parciais e múltiplos), somados na tela. Casa com ingestão SAP. |
| 6 | **Budget** | **Enriquecer** para o grão fino (incluir **fornecedor e projeto**), permitindo Desvio item a item. Recarga do orçamento com esse detalhe (BG2026 já traz Fornecedor). |
| 7 | **Perfis / escopo** | **Admin** (tudo) + **Responsável** (edita itens **dentro do seu escopo**: plataforma/país/unidade atribuídos ao usuário). |

---

## 2. Requisitos funcionais

**RF-01 — Item de fechamento (grão fino).** O sistema deve tratar cada item financeiro no grão `unidade × categoria × fornecedor × projeto × mês/ano`, com o atributo `cost_class` (CAPEX/OPEX). Plataforma e País são obtidos via a hierarquia da unidade.

**RF-02 — Estágios financeiros por item.** Para cada item/mês, o sistema deve consolidar: **Budget**, **Comprometido**, **Realizado**, **Pago**, **Forecast** e **Desvio**.

**RF-03 — Budget no grão fino.** O Budget deve existir por fornecedor/projeto (além de unidade/categoria/mês), para comparação item a item. Deve haver processo de (re)carga do orçamento nesse detalhe.

**RF-04 — Comprometido manual.** O responsável pode lançar/atualizar o valor comprometido por item/mês. Cada valor registra **origem = manual**, autor e timestamp. O modelo permite que a origem passe a ser **importação/SAP** sem alteração estrutural.

**RF-05 — Realizado e Pago transacionais.** Realizado e Pago são **lançamentos** (N por item/mês), suportando parciais e múltiplos documentos. A tela soma os lançamentos por item. Pago registra valor e **data de pagamento**.

**RF-06 — Forecast híbrido.** O sistema inicializa o Forecast por item/mês com um **valor padrão calculado**, editável pelo gestor. Revisões mantêm **histórico**.
- **Fórmula padrão preliminar (a confirmar):** "Realizado do mês, se já lançado; senão Budget do mês". *(ver Lacuna L-1)*

**RF-07 — Desvio.** O sistema calcula desvios relevantes (ex.: Realizado − Budget, Comprometido − Budget, Forecast − Budget) em R$ e %, por item e em subtotais.

**RF-08 — Tela de Fechamento Mensal.** Uma tela permite selecionar **Ano, Mês, Unidade** (e opcionalmente **País/Plataforma**) e visualizar os itens com as colunas: Fornecedor, Categoria, Projeto, Plataforma, Unidade, CAPEX/OPEX, Budget, Comprometido, Realizado, Pago, Forecast, Desvio.

**RF-09 — Edição por escopo.** Um usuário **Responsável** só vê/edita itens dentro do seu escopo (plataforma/país/unidade atribuídos). **Admin** vê/edita tudo.

**RF-10 — Origem e auditoria do dado.** Todo valor de estágio registra **origem** (`MANUAL | IMPORT | SAP`), **autor** e **timestamp**; o Forecast e (quando aplicável) os estágios mantêm histórico de alterações.

**RF-11 — Sem workflow (nesta fase).** Não há máquina de estados/status de item nesta fase. *(Reservar espaço no modelo para adicionar status no futuro sem reescrita.)*

---

## 3. Requisitos não-funcionais / restrições

- **RNF-01 — Preparação para integração.** Modelo e ingestão de Realizado/Pago devem ser **idempotentes** (chave natural + `external_id/external_ref`), prontos para `SAP/Data Platform → API → IT Cost Manager`. **Não** integrar agora.
- **RNF-02 — Sem virar ERP.** O sistema permanece **camada gerencial** de acompanhamento; não é contas a pagar nem ERP.
- **RNF-03 — Padrão técnico atual.** Manter stack atual (Next.js + PostgreSQL SQL-puro). Migrations em `.sql` idempotentes.
- **RNF-04 — Rede de testes.** Introduzir testes ao menos para contratos de API e regras de Desvio/Forecast/escopo (hoje não há testes).
- **RNF-05 — Versionar objetos de banco.** Definições de `vw_budget_vs_actual` e `execute_rateio` (hoje só no banco) devem ser versionadas no repo antes de alterá-las.

---

## 4. Modelo-alvo (alto nível, não implementar)

> Direção derivada das decisões. Detalhamento fica para a fase de design de cada IU.

- **Dimensão do item** (grão fino): referência a `unit_id, category_id, supplier_id, project_id, year, month` + `cost_class`. Plataforma/País via join da unidade.
- **Budget** (RF-03): estender a chave/granularidade de `budget_lines` para incluir `supplier_id` e `project_id` (mantendo versionamento).
- **Lançamentos de estágio** (RF-04/05): tabela transacional por estágio (`COMMITTED | ACTUAL | PAID`) no grão do item, com `value`, `stage`, `data_source (MANUAL|IMPORT|SAP)`, `external_ref`, `paid_date` (quando PAID), `created_by/at`, `updated_by/at`. *(Reaproveitar/estender `actual_lines`, que já é transacional, é candidato natural — decidir no design.)*
- **Forecast** (RF-06): valor por item/mês, com default calculado e override + histórico de revisões.
- **Consolidação** (RF-02/07/08): view/consulta que soma os lançamentos por item e cruza com Budget e Forecast, entregando as colunas da tela.
- **Permissões** (RF-09): aplicar filtro por `platform_id/country_id/unit_id` do usuário; perfil `admin` vs `responsável`.

---

## 5. Decisões finas resolvidas (L-1 a L-4)

| # | Tema | Decisão aprovada | Impacto no modelo |
|---|------|------------------|-------------------|
| **L-1** | Horizonte/default do Forecast | **Mensal por item** (12/ano); **anual = soma**. Default do mês: **Realizado se houver lançamento, senão Budget**; editável. | Forecast persistido por `item × mês` com histórico; anual é agregação. |
| **L-2** | Definição de Comprometido | Valor **já contratado ou com pedido aprovado**, ainda não realizado. Manual, com **referência opcional** (contrato/pedido). | Campo `external_ref`/referência no lançamento COMMITTED; mapeia a PO/SAP. |
| **L-3** | Recarga do Budget fino | **Fornecedor** vem do template BG2026; **Projeto = nulo/"A definir"** (fonte não tem projeto); linhas **sem fornecedor** → bucket **"Fornecedor a definir"**. | `budget_lines` ganha `supplier_id` (obrigatório com fallback bucket) e `project_id` (nulo). |
| **L-4** | Escopo do Responsável | **Escopo múltiplo (N:N)** por usuário — pode cobrir várias unidades/países/plataformas. | **Nova tabela `user_scopes`** (user × nível × id). **Supera** o escopo único (`platform_id/country_id/unit_id`) hoje no usuário. |

### Regras derivadas
- **RF-06 (detalhado):** Forecast do mês default = `Realizado do mês (se houver lançamento) senão Budget do mês`. Forecast anual do item = soma dos 12 meses. Overrides do gestor guardam histórico.
- **RF-04 (detalhado):** lançamento de Comprometido só é considerado quando representa contrato/pedido aprovado; campo de referência (contrato/pedido) opcional, reservado para conciliação com SAP.
- **RF-03 (detalhado):** processo de recarga do Budget mapeia fornecedor 1:1 do template; ausência de fornecedor → "Fornecedor a definir"; projeto não é carregado (atribuível item a item depois).
- **RF-09 (detalhado):** autorização por **múltiplos escopos** do usuário (tabela `user_scopes`); admin ignora escopo. Ajuste necessário nas telas de Usuário (passar de seleção única para múltipla).

## 6. Pré-requisitos técnicos (antes de construir o fechamento)

- **L-5.1** Corrigir o bug de contrato do Realizado (`amount` × `value`, `invoice_ref` × `doc_ref`, `description` × `note`) em `ActualClient` × `/api/actual`.
- **L-5.2** Versionar no repositório as definições de `vw_budget_vs_actual` e `execute_rateio` (hoje só no banco).
- **L-5.3** Confirmar/estabilizar em produção as migrações recentes (hierarquia, `cost_class`, i18n) — algumas relatadas como pendentes.

---

## 7. Próximos passos sugeridos

1. Fechar as lacunas **L-1 a L-4** (rodada curta de decisões finas).
2. Priorizar as unidades de implementação do assessment (§16): sugestão de sequência
   **IU-0** (consolidar base) → **IU-1** (corrigir Realizado) → **IU-2/IU-6** (grão + Budget enriquecido) → **IU-4/IU-5** (Pago/Comprometido) → **IU-6** (Forecast) → **IU-7** (tela de fechamento) → **IU-9** (auditoria/origem) → **IU-10** (preparação SAP) → **IU-11** (testes).
3. Aprovar escopo e sequência antes de iniciar qualquer implementação.
