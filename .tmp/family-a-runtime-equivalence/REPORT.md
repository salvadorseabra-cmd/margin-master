# Family A — Runtime Equivalence Audit (STRICT READ-ONLY)

**Generated:** 2026-06-22  
**Validation Lab:** `bjhnlrgodcqoyzddbpbd`  
**Mode:** STRICT READ-ONLY — no code changes, no DB writes, no deployments, no fixes

**Question:** Can the exact replay-validated Family A Option C rule be expressed using runtime-available signals only?

**Answer:** **C) Runtime implementation not equivalent**

---

## Executive summary

The documented Option C trigger (`documentedCombo AND qty_inflation_signature`) was replay-validated at **100% recall / 0 FP** on frozen artifacts. **Three of six combo gates are investigation-only** and have no exact runtime expression. A conservative proxy (per `family-a-implementation-prep`) was simulated end-to-end against the frozen 15-row replay harness, 42-row VL v25 extract population, and 15-row effective-paid population.

| Rule | Recall | Precision | FP | FN |
|------|--------|-----------|----|----|
| **Documented (replay-validated)** | 100% (2/2) | 100% (13/13 controls) | 0 | 0 |
| **Conservative runtime proxy** | 100% (2/2) | 92.3% (12/13 controls) | **1** | 0 |

The single divergence is **Rolo transient run 7** on invoice `f0aa5a08` — blocked by `hybrid_h_qty_2_stable` in the documented rule, **false-positive under the runtime proxy** when supplier is threaded (as production would). The exact validated rule cannot ship as-is; a conservative substitute is a **different rule** with a documented 1/10 GPT variance FP path.

---

## Documented replay rule (source of truth)

From `.tmp/family-a-option-c-replay/replay.mts` L111–121:

```
documentedCombo AND qty_inflation_signature

documentedCombo =
  ocr_qty_eq_1
  AND hybrid_h_qty_eq_2
  AND hybrid_h_qty_2_stable
  AND undiscounted_blank_desc
  AND unit_price_approx_total_at_qty1
  AND supplier_il_bocconcino

qty_inflation_signature =
  hybridHQty > 1
  AND binding_changed
  AND arithmetic_consistent
  AND diff_pct >= 0.45
```

---

## Signal inventory — runtime availability at `bindMonetaryColumns`

Production pipeline (earliest correction point):

```
Pass B → supplier (index.ts L91–110)
Pass D → GPT JSON { quantity, gross_unit_price, discount_pct, line_total_net, unit_price, total }
       → parseMonetaryLineItems (invoice-monetary-binding.ts L25–44)
       → bindMonetaryColumns (L214–217)  ← Option C correction target
       → monetaryToInvoiceLineItem strips discount_pct (L219–226)
       → reconcileLineItemAmounts → API → invoice_items (quantity, unit_price, total only)
```

| Signal | Runtime Available | Proxy Needed | Precision Loss |
|--------|-------------------|--------------|----------------|
| `ocr_qty_eq_1` | **No** | Inflation cluster (`qty=2` + `hasInconsistentGrossLineTotal` + `unit≈total`) or drop gate | Cannot read pre-Hybrid baseline on single run; passc proxy only (Mezzi/Ricotta qty=1 vs Hybrid qty=2). 11/15 effective-paid rows have `ocr_qty: null`. Omits column-faithful qty=2 (Acqua) via `unit≈total` gate. Does not distinguish OCR=1.35 (Gorgonzola) without discount/supplier gates. |
| `hybrid_h_qty_eq_2` | **Yes** | None | None — `MonetaryLineItem.quantity` from GPT JSON, unchanged through bind/reconcile/persist. |
| `hybrid_h_qty_2_stable` | **No** | Drop gate (no single-run substitute) | **1 documented FP** when omitted: Rolo run 7 (`sensitivity-result.json` `omit_hybrid_h_qty_2_stable`). Requires 10-run `.tmp/final-stability-audit/`. |
| `undiscounted_blank_desc` | **Partial** | `discount_pct == null \|\| discount_pct === 0` at bind input | Available in edge memory before `monetaryToInvoiceLineItem`; **not persisted**. Replay used visible-invoice DESC audit + RowSpec meta. Pomodori requires `discount_pct=20`, not null. Proxy untested vs full 51-row visible DESC audit. |
| `unit_price_approx_total_at_qty1` | **Yes** | None | `\|unit_price − total\| / total ≤ 2%` on bind input fields. |
| `supplier_il_bocconcino` | **Yes** (conditional) | Thread Pass B `supplier` into bind call | Pass B produces supplier (`index.ts` L192); **`bindMonetaryColumns` today receives no supplier** (`invoice-table-extraction.ts` L401). Available on `invoices.supplier` after client persist only — too late for bind-time correction. |
| `binding_changed` | **Conditional** | Re-invoke `bindMonetaryColumns` internally; compare pre/post `unit_price` | Not emitted or logged in production. Works when gross `unit_price` reaches bind input (true on current VL Family A rows; not schema-guaranteed). |
| `arithmetic_consistent` | **Conditional** | Same as `binding_changed` | Derived post-bind: `\|qty × boundUnit − total\| ≤ 0.02`. |
| `diff_pct_ge_45` | **Conditional** | Same as `binding_changed` | Gorgonzola effective-paid `diff_pct=34.25%` — blocked only by threshold. Combo-stress: threshold ≤0.30 would pass Gorgonzola inflation gate. |
| `qty_inflation_signature` | **Partial** | Composite of binding signals + `qty > 1` at bind time | Expressible at bind if `discount_pct` and supplier threaded; **not equivalent** to full documented combo without dropped gates. |

**Persisted schema** (`20260511115814_....sql`): `name`, `quantity`, `unit`, `unit_price`, `total` only — no `ocr_qty`, `discount_pct`, binding metadata, or stability fields.

---

## Production code path evidence

**Quantity authored at GPT pass; bind preserves qty:**

```401:404:supabase/functions/extract-invoice/invoice-table-extraction.ts
  const boundItems = bindMonetaryColumns(parseMonetaryLineItems(parsed.items));
  const items = reconcileLineItemAmounts(
    boundItems.map(monetaryToInvoiceLineItem),
  );
```

**Effective paid binding (source of inflation signature):**

```120:129:supabase/functions/extract-invoice/invoice-monetary-binding.ts
function applyEffectivePaidPrice(item: MonetaryLineItem): MonetaryLineItem {
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

**Pass C vs Hybrid H qty divergence (passc baseline not preserved):**

| Product | passc reextract qty | v25 Hybrid H qty |
|---------|--------------------:|-----------------:|
| Mezzi Paccheri | 1 | 2 |
| Ricotta | 1 | 2 |
| Rolo (stable) | 1 | 1 |
| Acqua | 2 | 2 |

Sources: `.tmp/passc-refinement-validation/reextract/f0aa5a08-….json`, `.tmp/final-validation-lab-rerun/extracts/f0aa5a08-….json`

---

## Conservative runtime proxy (implementation-prep proposal)

From `.tmp/family-a-implementation-prep/REPORT.md` L103–107, L277–282:

| Replay gate | Runtime replacement |
|-------------|---------------------|
| `ocr_qty_eq_1` | Dropped — implied by inflation signature |
| `hybrid_h_qty_2_stable` | **Dropped** — not observable single-run |
| `undiscounted_blank_desc` | `discount_pct == null \|\| 0` at bind input |

**Proxy trigger:**

```
quantity === 2
AND (discount_pct == null || discount_pct === 0)
AND supplier matches IL BOCCONCINO
AND unit_price ≈ total (±2%)
AND qty_inflation_signature
```

This is a **different rule** from the replay-validated documented combo.

---

## Simulation results (read-only, no DB)

Method: re-invoke production `bindMonetaryColumns` on frozen extract/DB binding fields; compare documented vs proxy evaluation. Full data in `.tmp/family-a-runtime-equivalence/equivalence.json`.

### Frozen 15-row replay harness (`.tmp/family-a-option-c-replay/replay-result.json`)

| Rule | Recall | Precision | FP | FN |
|------|--------|-----------|----|----|
| Documented | 2/2 (100%) | 13/13 (100%) | 0 | 0 |
| Runtime proxy | 2/2 (100%) | 12/13 (92.3%) | **1** | 0 |

**Divergence:** `Rolo (transient run 7)` — documented **no trigger** (`hybrid_h_qty_2_stable=false`); runtime proxy **triggers** when supplier threaded as IL BOCCONCINO.

Rolo run 7 signals (both rules agree on inflation profile):

- `hybrid_h_qty_eq_2`: true (qty=2)
- `unit_price_approx_total_at_qty1`: true (12.187 ≈ 12.17)
- `qty_inflation_signature`: true (`diff_pct=50.03%`)
- `undiscounted`: true
- `supplier_il_bocconcino`: true (production would thread Pass B)

Only `hybrid_h_qty_2_stable=false` blocks the documented rule. Proxy omits this gate → **FALSE_POSITIVE**.

Confirms `.tmp/family-a-option-c-replay/sensitivity-result.json` ablation `omit_hybrid_h_qty_2_stable`.

### VL v25 extract population (42 rows)

Scope audit references **51 rows** (passc reextract across 6 invoices). Frozen v25 Hybrid H extracts contain **42 items**; 9 passc-only rows lack v25 extracts (Aviludo April `c2f52357` returned 0 items in v25 rerun per `passc-refinement-validation/reextract/summary.json`).

| Rule | Recall | Precision | FP | FN |
|------|--------|-----------|----|----|
| Documented | 2/2 | 40/40 non-Family-A | 0 | 0 |
| Runtime proxy | 2/2 | 40/40 non-Family-A | 0 | 0 |

No divergence on v25 baseline extracts. Rolo run 7 is not in v25 baseline (qty=1 stable); FP path requires GPT variance artifact.

### Effective-paid 15-row population (`.tmp/family-a-full-population-replay/`)

| Rule | Recall | Precision | FP | FN |
|------|--------|-----------|----|----|
| Documented | 2/2 | 13/13 | 0 | 0 |
| Runtime proxy | 2/2 | 13/13 | 0 | 0 |

Effective-paid rows use persisted binding fields; Rolo run 7 not in population. Documented rule inherits investigation metadata for 11/15 rows with `ocr_qty: null` (treated as `ocr_qty_eq_1=false`).

---

## Why not A or B?

### Not A — exact runtime implementation

Three documented combo gates are **RED** in implementability audit (`.tmp/family-a-implementability-audit/signals.json`):

1. `ocr_qty_eq_1` — no pipeline field; passc baseline only
2. `hybrid_h_qty_2_stable` — multi-run investigation aggregate
3. `undiscounted_blank_desc` — replay RowSpec / visible DESC audit; not a stored production signal

Binding cluster signals are recomputable at bind time but are **not production emissions** today.

### Not B — conservative proxy is not equivalent

A conservative proxy **can** be coded at `bindMonetaryColumns` with known risk, but it is **not equivalent** to the replay-validated rule:

- **1 FP** on documented boundary case (Rolo run 7) that the validated rule explicitly blocks
- Proxy was **never offline replay-validated as an integrated package** before implementation-prep marked READY (`.tmp/family-a-sanity-review/verdict.json`: NOT READY)
- Shipping the proxy means shipping a **new rule** at ~75% runtime confidence vs 88% on documented rule

If accepting a **non-equivalent substitute**, quantified risk on frozen populations:

| Population | FP rate | FN rate | Notes |
|------------|---------|---------|-------|
| Replay harness (15) | 1/13 controls (7.7%) | 0/2 failures (0%) | Rolo run 7 only |
| VL v25 extracts (42) | 0/40 (0%) | 0/2 (0%) | Baseline only; run 7 not present |
| Effective-paid (15) | 0/13 (0%) | 0/2 (0%) | Persisted rows; run 7 not present |
| Live Bocconcino 1/10 GPT variance | **Unknown** | 0% on frozen | Run 7 proves transient qty=2 path exists on target invoice |

---

## Final verdict

### **C) Runtime implementation not equivalent**

**Evidence:**

1. **Exact rule:** 3/6 documented combo gates require investigation artifacts (passc OCR, 10-run stability, visible DESC audit) — not available at single-run `bindMonetaryColumns`.
2. **Conservative proxy diverges:** Simulated proxy triggers on Rolo run 7; documented rule does not (`equivalence.json` `rolo_run7_with_supplier_threaded`).
3. **Prior audits align:** Implementability audit verdict B (partial); sanity review NOT READY — validated fix ≠ implementable fix.
4. **No integrated proxy replay existed** before this audit; this audit closes that gap and shows non-equivalence.

**Recommendation:** Stop and redesign. Do not implement the documented Option C combo verbatim. Any production rule must either:

- Add runtime observability for dropped gates (e.g., persist `discount_pct`, dual qty baseline), or
- Accept the Rolo run 7 FP path and validate live 10× stability post-deploy, or
- Redesign gates (e.g., product allowlist for Mezzi/Ricotta only — out of scope for Option C as replayed)

---

## Cross-reference index

| Artifact | Role |
|----------|------|
| `.tmp/family-a-runtime-equivalence/equivalence.json` | Machine-readable signal inventory + simulation |
| `.tmp/family-a-implementability-audit/` | Prior signal classification (verdict B) |
| `.tmp/family-a-sanity-review/` | Adversarial NOT READY review |
| `.tmp/family-a-implementation-prep/` | Proposed runtime proxy mapping |
| `.tmp/family-a-option-c-replay/` | Documented rule 100% replay proof |
| `.tmp/family-a-full-population-replay/` | 15/15 effective-paid replay |
| `.tmp/family-a-option-c-replay/sensitivity-result.json` | Stability gate ablation |
| `supabase/functions/extract-invoice/invoice-monetary-binding.ts` | Bind-time signal availability |
| `supabase/functions/extract-invoice/invoice-table-extraction.ts` | GPT → bind pipeline |

**No code changes. No DB writes. No deployments.**
