# Validação de Mismatch de Quantidades — READ-ONLY

**Gerado:** 2026-06-21  
**Validation Lab:** `bjhnlrgodcqoyzddbpbd`  
**Método:** SELECT read-only na VL + replay do pipeline de produção (`bindMonetaryColumns` → `resolveCountablePurchaseQuantityForCost` → `recipeOperationalCostFieldsFromInvoiceLine` → `formatRowPurchaseQuantityLabel`)

---

## Resumo executivo

| Métrica | Valor |
|---------|-------|
| Linhas de fatura analisadas | 51 |
| Matches confirmados | 50 |
| **Linhas com mismatch (≥1 critério)** | **19** |
| **Ingredientes distintos afetados** | **16** |
| Casos Family A (Ricotta + Mezzi) | 2 |
| Casos adicionais além de Family A | 17 |

### Conclusão principal

**Ricotta e Mezzi não são os únicos casos de mismatch de quantidade** — são apenas os únicos **previamente identificados como Family A** (qty OCR=1 → extração Hybrid H qty=2, total preservado, unit_price ≈ total/qty).

Com os três critérios pedidos, existem **19 linhas** em **16 ingredientes** onde pelo menos uma inconsistência aparece. Os mecanismos dividem-se em:

1. **Family A (2 linhas)** — Ricotta + Mezzi: binding monetário trata `qty>1` com `total ≈ unit_price` → `resolveCountablePurchaseQuantityForCost` devolve **1** enquanto a fatura e o Last Purchase mostram **2**.
2. **Colapso `isUnitPricePerPricedUnit` (9 linhas)** — Compras legítimas multi-unidade (Anchoas×2, Gema×6, Atum×2, Mozzarella×10, Stracciatella×24, Mozzarella julienne×10): invoice qty > 1 mas stored `purchase_quantity=1` após binding.
3. **Notação de pack interno (8 linhas)** — Critério 3 dispara quando `purchaseContainerCount` reflecte unidades internas do pack (`*6`, `*15`, `*24`) e não a qty da linha: Pomodori, S.Pellegrino (×2), Paccheri De Cecco, Ginger beer, Peroni, Aceto, Rulo capra.
4. **Peso vs unidade (1 linha)** — Guanciale: qty=5,996 kg com stored `purchase_quantity=1 un`.

---

## Critérios aplicados

| # | Critério | Implementação |
|---|----------|---------------|
| 1 | `invoice_items.quantity` ≠ purchase_history `purchase_quantity` | Após binding: qty da linha vs `recipeOperationalCostFieldsFromInvoiceLine.purchase_quantity` (mesma unidade genérica `un`) |
| 2 | `invoice_items.quantity` ≠ Last Purchase | Qty bound vs valor parseado de `formatRowPurchaseQuantityLabel` |
| 3 | usable derivado implica mais unidades que compradas | `purchaseContainerCount === invoice qty` mas `resolveCountablePurchaseQuantityForCost` menor; ou inner pack count > purchaseQtyForCost |

**Nota:** Linhas `cx` com `purchase_quantity` em unidades internas (ex. 1 cx → 12 un) **não** são flagged no critério 1 — comportamento intencional do procurement layer.

---

## Tabela completa de mismatches

| # | Ingrediente | Fatura (fornecedor) | Qty fatura | Qty stored | Qty Last Purchase | Usable | Custo operacional | Custo procurement | Tipos | Family A |
|---|-------------|---------------------|------------|------------|-------------------|--------|-------------------|---------------------|-------|----------|
| 1 | Anchoas | Aviludo May | 2 un | 1 un | 2 un | 990 g | €20.18 / kg | €9.99 / can | 1,1b,3 | — |
| 2 | Gema líquida | Aviludo May | 6 un | 1 un | 6 un | 6000 g | €10.49 / kg | €10.49 / unit | 1,1b,3 | — |
| 3 | Anchoas | Aviludo April | 2 un | 1 un | 2 un | 990 g | €19.17 / kg | €9.49 / can | 1,1b,3 | — |
| 4 | Gema líquida | Aviludo April | 6 un | 1 un | 6 un | 6000 g | €10.19 / kg | €10.19 / unit | 1,1b,3 | — |
| 5 | Atum em óleo | Aviludo May | 2 un | 1 un | 2 un | 2000 g | €6.29 / kg | €6.29 / bag | 1,1b,3 | — |
| 6 | Mozzarella fior di latte | Bocconcino | 10 un | 1 un | 10 un | 1000 g | €81.20 / kg | €8.12 / unit | 1,1b,3 | — |
| 7 | Stracciatella | Bocconcino | 24 un | 1 un | 24 un | 6000 g | €12.44 / kg | €3.11 / unit | 1,1b,3 | — |
| 8 | **Mezzi paccheri mancini** | **Bocconcino** | **2 un** | **1 un** | **2 un** | **6000 g** | **€4.55 / kg** | **€13.65 / case** | **1,3** | **✓** |
| 9 | Pomodori pelati | Bocconcino | 1 un | 1 un | 1 un | 15000 g | €1.47 / kg | €22.05 / case | 3 | — |
| 10 | Água san pellegrino | Bocconcino | 2 un | 11250 ml | 2 un | 11250 ml | €3.73 / L | €20.97 / case | 3 | — |
| 11 | **Ricotta trevigiana** | **Bocconcino** | **2 un** | **1 un** | **2 un** | **3000 g** | **€2.66 / kg** | **€3.99 / unit** | **1,3** | **✓** |
| 12 | Paccheri lisci | Emporio | 24 | 1 un | 24 | 12000 g | €4.20 / kg | €2.10 | 3 | — |
| 13 | Água san pellegrino | Emporio | 2 un | 11250 ml | 2 un | 11250 ml | €3.43 / L | €19.28 / case | 3 | — |
| 14 | Ginger beer | Emporio | 24 | 2 ml | 24 | 48 ml | €405.00 / L | €0.81 | 3 | — |
| 15 | Guanciale stagionato | Mammafiore | 5,996 un | 1 un | 6 un | 10500 g | €6.18 / kg | €10.83 / unit | 1,1b,2,3 | — |
| 16 | Peroni 33cl | Mammafiore | 24 un | 7920 ml | 24 un | 7920 ml | €3.24 / L | €1.07 / bottle | 3 | — |
| 17 | Aceto balsamico IGP | Mammafiore | 1 un | 10000 ml | 1 un | 10000 ml | €1.56 / L | €15.55 / unit | 3 | — |
| 18 | Mozzarella julienne | Mammafiore | 10 un | 1 un | 10 un | 30000 g | €6.68 / kg | €20.03 / bag | 1,1b,3 | — |
| 19 | Rulo di capra | Mammafiore | 1 un | 1 un | 1 un | 2000 g | €5.43 / kg | €10.86 / unit | 3 | — |

**Legenda tipos:** 1 = invoice vs stored purchase_quantity · 1b = invoice vs catalog `ingredients.purchase_quantity` · 2 = invoice vs Last Purchase display · 3 = usable/container > purchaseQtyForCost

---

## Detalhe Family A (Ricotta + Mezzi)

| Campo | Ricotta trevigiana | Mezzi paccheri mancini |
|-------|-------------------|------------------------|
| Invoice qty (bound) | 2 un | 2 un |
| Total / unit (bound) | €7,97 / €3,99 | €27,30 / €13,65 |
| `ingredients.purchase_quantity` | 2 | 2 |
| Replay stored `purchase_quantity` | **1** | **1** |
| Last Purchase display | 2 un | 2 un |
| Usable stock | 3000 g (2×1,5 kg) | 6000 g |
| `purchaseContainerCount` | 2 | 6 |
| `resolveCountablePurchaseQuantityForCost` | **1** | **1** |
| Mecanismo | `isUnitPricePerPricedUnit`: total≈qty×unit_price após binding → denominador colapsa para 1 | Idem + inner pack `(CX 1KG*6)` |

**Inconsistência visível ao utilizador (Ricotta):** Last Purchase mostra **2 un**, mas o pipeline de custo operacional usa **1 un** como denominador → custo operacional €2,66/kg em vez de reflectir 2 unidades compradas ao preço total €7,97.

---

## Contagens por tipo de mismatch

| Tipo | Ocorrências |
|------|-------------|
| invoice vs stored purchase_quantity | 11 |
| invoice vs catalog purchase_quantity | 9 |
| invoice vs Last Purchase display | 1 |
| Last Purchase vs catalog | 9 |
| usable implica mais unidades | 19 |

---

## Resposta à pergunta central

> **Ricotta e Mezzi são os ÚNICOS casos, ou apenas os únicos identificados antes?**

**Apenas os únicos identificados antes (Family A).** A auditoria anterior (`.tmp/family-a-scope-audit/`) limitou-se a 15 candidatos OCR qty=1 + notação de peso/pack.

**Não são os únicos mismatches de quantidade no sistema.** Com scan completo das 51 linhas VL:

- **2 linhas** = Family A confirmado (Ricotta, Mezzi)
- **+17 linhas** = outros mismatches, maioritariamente:
  - multi-unidade legítima onde `resolveCountablePurchaseQuantityForCost` colapsa para 1 (Aviludo/Bocconcino)
  - packs multi-camada onde critério 3 compara outer qty vs inner `purchaseContainerCount` (S.Pellegrino, Pomodori, etc.)

---

## Artefactos

- `.tmp/quantity-mismatch-validation/mismatches.json` — dados completos
- `.tmp/quantity-mismatch-validation/scan.mts` — script read-only reprodutível

## Referências de código

- `resolveCountablePurchaseQuantityForCost` — `src/lib/invoice-purchase-price-semantics.ts:587`
- Last Purchase display — `formatRowPurchaseQuantityLabel` → `buildLastPurchaseCostPresentation` em `src/lib/ingredient-detail-panel.ts:299`
- Purchase history surface — `buildRecentPurchases` em `src/lib/ingredient-purchase-memory.ts:188`
