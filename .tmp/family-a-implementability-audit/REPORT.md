# Family A — Option C Implementability Audit (STRICT READ-ONLY)

Generated: 2026-06-21  
VL project: `bjhnlrgodcqoyzddbpbd`  
Mode: READ-ONLY — no code, DB, deployment, or prompt changes

**Question:** Can the successful Option C replay logic be expressed using **real pipeline data at runtime**?

**Answer:** **No — not in full.** Verdict **B) Partially depends on investigation-only signals** (see Task 7).

---

## Executive summary

Option C replay combines **10 signals** from frozen investigation artifacts. Of the **6 documented-combo gates**, only **2** (`hybrid_h_qty_eq_2`, `supplier_il_bocconcino`) plus **`unit_price_approx_total_at_qty1`** are reliably available from production pipeline output. **Three gates are investigation-only** (`ocr_qty_eq_1`, `hybrid_h_qty_2_stable`, `undiscounted_blank_desc` as replayed). **Binding-derived signals** (`binding_changed`, `diff_pct`, `total_preserved`, `qty_inflation_signature`) can be **recomputed offline** from `invoice_items` using `bindMonetaryColumns`, but production **never emits or stores** them, and they depend on **gross unit_price** surviving persistence (true on current VL Family A rows, not guaranteed by schema).

---

## Pipeline reference (production)

```
index.ts
  Pass A  → issue date
  Pass B  → supplier                    ← supplier_il_bocconcino
  Pass C  → footer totals
  Pass D  → table GPT (Pass C / Hybrid H)
            → parseMonetaryLineItems
            → bindMonetaryColumns       ← binding_changed, diff_pct, effective paid
            → reconcileLineItemAmounts
            → finalizeExtractedLineItems (net subtotal reconcile)
  → JSON { supplier, items[{ name, quantity, unit, unit_price, total }] }
invoices.tsx runExtraction
  → invoice_items INSERT (quantity, unit, unit_price, total only)
  → ingredient cost sync
```

**Not invoked at runtime:** `parseContinente`, `parsePadaria`, `stages.ts` line filters (`index.ts` L69).

**Persisted line-item fields:** `name`, `quantity`, `unit`, `unit_price`, `total` only (`20260511115814_....sql` L2–12). No `gross_unit_price`, `discount_pct`, `line_total_net`, `ocr_qty`, binding metadata, or stability fields.

---

## TASK 1 — Signal inventory

| Signal | Used in replay | Runtime available? | Source (replay) | Source (production) | Deterministic? | Class |
|--------|----------------|-------------------|-----------------|---------------------|----------------|-------|
| `ocr_qty_eq_1` | Yes (combo) | **No** | `meta.ocrQty` hardcoded / passc baseline | Single `quantity` from Pass C only | No (needs external baseline) | **D** Not available |
| `hybrid_h_qty_eq_2` | Yes (combo) | **Yes** | `item.quantity` from frozen extract | Pass C → bind → reconcile → persist | Yes | **A** During extraction |
| `hybrid_h_qty_2_stable` | Yes (combo) | **No** | 10/10 stability audit / risk `stable_qty_2` | Not computed | No | **D** Investigation-only |
| `undiscounted_blank_desc` | Yes (combo) | **Partial** | Manual RowSpec / risk heuristic | Pass C `discount_pct` (transient); lost before persist | Yes if read at Pass C | **A→C** Extraction then lost |
| `supplier_il_bocconcino` | Yes (combo) | **Yes** | `extract.supplier` / meta | Pass B → `invoices.supplier` | Yes | **A** During extraction |
| `unit_price_approx_total_at_qty1` | Yes (combo) | **Yes** | `\|unit−total\|/total ≤ 2%` on extract fields | `invoice_items.unit_price`, `.total` | Yes | **B** After persistence |
| `total_preserved` | Yes (aux) | **Conditional** | Re-bind replay | Recomputable; not stored | Yes | **B** After persistence |
| `binding_changed` | Yes (inflation) | **Conditional** | Re-run `bindMonetaryColumns` | Runs once; delta not exposed | Yes | **B** After persistence |
| `diff_pct_ge_45` | Yes (inflation) | **Conditional** | Derived from binding replay | Not stored | Yes | **B** After persistence |
| `qty_inflation_signature` | Yes (trigger) | **Partial** | Composite in `evaluateOptionC` | Not computed in prod | Yes | **B** Composite |

**Classification key:** A = during extraction · B = after persistence · C = investigation-only · D = not available

---

## TASK 2 — Pipeline location (earliest stage)

| Signal | Earliest production stage | Notes |
|--------|---------------------------|-------|
| `ocr_qty_eq_1` | — | Replay uses **passc-refinement reextract** qty (pre-Hybrid baseline), not live pipeline field |
| `hybrid_h_qty_eq_2` | **Pass C table GPT** → unchanged through `finalizeExtractedLineItems` | `reconcileLineItemAmounts` / `reconcileLineItemsToNetSubtotal` do not alter qty |
| `hybrid_h_qty_2_stable` | — | Requires **multi-run** `.tmp/final-stability-audit/` |
| `undiscounted_blank_desc` | **Pass C** (`discount_pct` in GPT JSON) | Available in edge function memory at `bindMonetaryColumns` input; **stripped** at `monetaryToInvoiceLineItem` |
| `supplier_il_bocconcino` | **Pass B** (`extractMetadataFromImage`) | Also on `invoices.supplier` after client persist |
| `unit_price_approx_total_at_qty1` | **`bindMonetaryColumns` output** | Uses final `unit_price` + `total` on line item |
| `total_preserved` | **`bindMonetaryColumns`** (`hasInconsistentGrossLineTotal`) | Replay recomputes from persisted fields |
| `binding_changed` | **`bindMonetaryColumns`** (`applyEffectivePaidPrice`) | Production applies once; replay re-applies on persisted gross unit |
| `diff_pct_ge_45` | **`bindMonetaryColumns`** | `pctDiff(rawUnit, boundUnit)` in replay |
| `qty_inflation_signature` | **`bindMonetaryColumns` + qty** | Composite; not a single pipeline emission |

**Stage map (ordered):**

1. **Pass C (table GPT)** — `invoice-table-extraction.ts` L305–414  
2. **`parseMonetaryLineItems`** — `invoice-monetary-binding.ts` L25–44  
3. **`bindMonetaryColumns`** — `invoice-monetary-binding.ts` L214–217  
4. **`reconcileLineItemAmounts`** — `invoice-line-reconcile.ts` L68–85  
5. **`finalizeExtractedLineItems`** — `invoice-table-extraction.ts` L416–421  
6. **Invoice persistence** — `invoices.tsx` L1446–1461  
7. **Ingredient updates** — `invoices.tsx` L1481–1505 (`syncOperationalIngredientCostsFromInvoiceLines`)

---

## TASK 3 — Stability gate audit (`stable_qty_2`)

| Question | Finding |
|----------|---------|
| Observable at single-run runtime? | **No** |
| Only from historical reruns? | **Yes** — `.tmp/final-stability-audit/extracts/f0aa5a08-*-run*.json` (10 invokes) |
| Does production code access this? | **No** — grep of `supabase/functions/extract-invoice/` and `src/` finds zero `stable_qty` / stability-gate logic |

**Evidence:**

- Replay sets `hybrid_h_qty_2_stable: meta.hybridHQty2Stable === true` (`.tmp/family-a-option-c-replay/replay.mts` L98).
- RowSpec meta is hand-authored: Mezzi/Ricotta `hybridHQty2Stable: true` with note `"10/10 stability qty=2"` (L143–144, L157–158); Rolo run 7 `false` with `"1/10 transient qty=2"` (L200).
- Risk audit **does not compute** stability from runs — `stable_qty_2: FAMILY_A_IDS.has(id)` for Family A rows only (`.tmp/family-a-effective-paid-risk-audit/audit.mts` L125).
- Stability data: Mezzi/Ricotta **qty=2 in all 10 runs** (`f0aa5a08-all-runs.json`); Rolo **qty=2 only in run 7** (`f0aa5a08-run7.json` L49–50 vs baseline qty=1 in v25 extract).

**Conclusion:** `stable_qty_2` is a **post-hoc investigation aggregate**, not a runtime observable.

---

## TASK 4 — OCR qty audit

| Question | Finding |
|----------|---------|
| Raw OCR qty preserved after extraction? | **No** — only final Hybrid H `quantity` is returned and persisted |
| Available independently from GPT? | **No** — `index.ts` L69: deterministic OCR parsers not invoked |
| Can runtime distinguish OCR=1 → GPT=2 without replay artifacts? | **No** on single run |

**Evidence:**

| Source | Mezzi Paccheri qty | Ricotta qty |
|--------|-------------------|-------------|
| passc-refinement reextract (`f0aa5a08....json` L26, L47) | **1** | **1** |
| v25 Hybrid extract (`final-validation-lab-rerun/extracts/f0aa5a08....json` L28, L49) | **2** | **2** |
| Persisted `invoice_items` (via effective-paid audit binding.raw.qty) | **2** | **2** |

- Scope audit documents OCR proxy: *"Pass C pre-Hybrid baseline (passc-refinement-validation/reextract/)"* (`.tmp/family-a-scope-audit/REPORT.md` L5).
- Client tracing (`traceInvoiceQuantityStage`, `invoices.tsx` L399–417) logs quantity at stages but **does not retain** a separate OCR/pre-inflation value.
- Full-population replay: **11/15 effective-paid rows have `ocr_qty: null`** in risk-population → treated as `ocr_qty_eq_1=false` (`.tmp/family-a-full-population-replay/replay.mts` L167–170).

**Conclusion:** `ocr_qty_eq_1` requires **frozen passc baseline or manual visible-invoice overrides**, not production pipeline data.

---

## TASK 5 — Replay vs runtime comparison

| Condition | Replay source | Runtime equivalent exists? |
|-----------|---------------|----------------------------|
| `ocr_qty === 1` | passc reextract + RowSpec `meta.ocrQty` | **No** — manually reconstructed |
| `hybrid_h_qty === 2` | Frozen extract `item.quantity` / DB `quantity` | **Yes** — `invoice_items.quantity` |
| `hybrid_h_qty_2_stable` (10/10) | Stability audit + hand meta | **No** — manually reconstructed |
| `undiscounted_blank_desc` | RowSpec meta / risk heuristic | **Partial** — Pass C `discount_pct` at edge only; replay uses **name/supplier heuristics** for full population |
| `unit_price ≈ total at qty=1` | `replayBinding` on extract fields | **Yes** — from persisted `unit_price`, `total` |
| `supplier === IL BOCCONCINO` | Extract `supplier` / meta | **Yes** — Pass B + `invoices.supplier` |
| `total_preserved` | Binding replay | **Conditional** — re-bind from DB; not stored |
| `binding_changed` | Re-run `bindMonetaryColumns` | **Conditional** — not emitted; works when gross unit persisted |
| `diff_pct ≥ 45%` | Binding replay | **Conditional** — derived offline |
| `qty_inflation_signature` | Composite in `evaluateOptionC` | **Partial** — needs binding replay + qty |

**Manually reconstructed in replay (not from live pipeline alone):**

1. All `meta.ocrQty` values in `.tmp/family-a-option-c-replay/replay.mts` ROWS array (L132–333)
2. All `meta.hybridHQty2Stable` values (stability audit annotations)
3. All `meta.undiscountedBlankDesc` values (scope / visible DESC audit)
4. Full-population `deriveMeta()` merges **risk-population.json** investigation signals (`.tmp/family-a-full-population-replay/replay.mts` L150–197)

---

## TASK 6 — Implementability score

| Signal | Score | Rationale |
|--------|-------|-----------|
| `ocr_qty_eq_1` | **RED** | No pipeline field; passc proxy only |
| `hybrid_h_qty_eq_2` | **GREEN** | Direct from extract/persisted quantity |
| `hybrid_h_qty_2_stable` | **RED** | Multi-run investigation only |
| `undiscounted_blank_desc` | **RED** | Replay meta/heuristic; `discount_pct` not persisted |
| `supplier_il_bocconcino` | **GREEN** | Pass B supplier on invoice |
| `unit_price_approx_total_at_qty1` | **GREEN** | Deterministic from line amounts |
| `total_preserved` | **YELLOW** | Recomputable; depends on gross unit in DB |
| `binding_changed` | **YELLOW** | Re-bind only; not production signal |
| `diff_pct_ge_45` | **YELLOW** | Derived from binding replay |
| `qty_inflation_signature` | **YELLOW** | Composite; partial runtime expression |

**Totals:** GREEN **3** · YELLOW **4** · RED **3**

---

## TASK 7 — Final verdict

### **B) Partially depends on investigation-only signals**

**Evidence (no fixes proposed):**

1. **Documented Option C trigger** = 6 combo signals **AND** `qty_inflation_signature` (`.tmp/family-a-option-c-replay/replay.mts` L111–121).
2. **3 of 6 combo gates** are not expressible from a single production extraction:
   - `ocr_qty_eq_1` — passc baseline, not pipeline (`scope-audit/REPORT.md` L5; `index.ts` L69)
   - `hybrid_h_qty_2_stable` — 10-run stability audit only (`final-stability-audit/`)
   - `undiscounted_blank_desc` — replay uses investigation meta; production drops `discount_pct` before persist (`invoice-monetary-binding.ts` L219–226)
3. **Binding cluster** is algorithmically available via `bindMonetaryColumns` but **not production signals** — replay re-invokes binding on frozen/DB rows (`.tmp/effective-paid-contract-validation.mts` L93–132), while `invoice-table-extraction.ts` L401 runs binding once without recording `binding_changed`.
4. Full-population replay **explicitly assumes** investigation metadata: *"11 rows lack passc OCR baseline"* (`.tmp/family-a-full-population-replay/REPORT.md` L651).

**Not A** because three combo gates require non-runtime artifacts.  
**Not C** because supplier, hybrid qty, unit≈total, and conditional binding replay **do** map to real pipeline/DB fields.

---

## Code references (production)

**Pass C + binding pipeline:**

```401:404:supabase/functions/extract-invoice/invoice-table-extraction.ts
  const boundItems = bindMonetaryColumns(parseMonetaryLineItems(parsed.items));
  const items = reconcileLineItemAmounts(
    boundItems.map(monetaryToInvoiceLineItem),
  );
```

**Effective paid binding (source of `binding_changed` in replay):**

```120:129:supabase/functions/extract-invoice/invoice-monetary-binding.ts
function applyEffectivePaidPrice(item: MonetaryLineItem): MonetaryLineItem {
  // Rows with an extracted discount % are net-derived in applyStructuredBinding.
  if (item.discount_pct != null) {
    return item;
  }
  if (!hasInconsistentGrossLineTotal(item)) return item;
  return {
    ...item,
    unit_price: round2(item.total! / item.quantity!),
  };
}
```

**Structured fields stripped before API response:**

```219:226:supabase/functions/extract-invoice/invoice-monetary-binding.ts
export function monetaryToInvoiceLineItem(item: MonetaryLineItem): InvoiceLineItem {
  return {
    name: item.name,
    quantity: item.quantity,
    unit: item.unit,
    unit_price: item.unit_price,
    total: item.total,
  };
}
```

**Persistence (no OCR/binding/discount columns):**

```1446:1457:src/routes/invoices.tsx
      const insertRows = normalizedItems.map((it: ItemRow) => {
        const name = String(it.name ?? "Unknown");
        const unit = resolveInvoiceItemUnit({ name, unit: it.unit });
        return {
          invoice_id: invoiceId,
          user_id: user.id,
          name: name.slice(0, 200),
          quantity: it.quantity ?? null,
          unit: unit ? unit.slice(0, 20) : null,
          unit_price: it.unit_price ?? null,
          total: it.total ?? null,
        };
      });
```

**Option C evaluation (replay-only logic):**

```90:121:.tmp/family-a-option-c-replay/replay.mts
function evaluateOptionC(
  hybridHQty: number,
  binding: ReturnType<typeof replayBinding>,
  meta: RowSpec["meta"],
) {
  const signals = {
    ocr_qty_eq_1: meta.ocrQty === 1,
    hybrid_h_qty_eq_2: hybridHQty === 2,
    hybrid_h_qty_2_stable: meta.hybridHQty2Stable === true,
    undiscounted_blank_desc: meta.undiscountedBlankDesc,
    // ...
  };
  const documentedCombo =
    signals.ocr_qty_eq_1 &&
    signals.hybrid_h_qty_eq_2 &&
    signals.hybrid_h_qty_2_stable &&
    signals.undiscounted_blank_desc &&
    signals.unit_price_approx_total_at_qty1 &&
    signals.supplier_il_bocconcino;
  const wouldTrigger = documentedCombo && signals.qty_inflation_signature;
```

---

## Artifacts

- `.tmp/family-a-implementability-audit/signals.json` — machine-readable inventory
- `.tmp/family-a-implementability-audit/REPORT.md` — this report
