# Validation Findings UX Quality Pass

**Validation Lab:** `bjhnlrgodcqoyzddbpbd`  
**Date:** 2026-06-25  
**Scope:** All `ValidationFinding` codes emitted by `src/lib/invoice-validation/validators/*.ts`, plus evidence presentation via `humanize-evidence-key.ts` and `render-finding.tsx`  
**Mode:** Read-only review — no code changes

---

## Executive summary

| Metric | Count |
|--------|------:|
| Finding codes reviewed | 9 |
| Operational sub-variants (same code, different copy) | 2 |
| **Excellent** (minor or no wording changes) | 3 |
| **Needs improvement** | 6 |
| Renderer / evidence-layer issues (cross-cutting) | 5 |

**Top 3 highest-priority wording changes**

1. **`OPERATIONAL_NORMALIZATION_INCONSISTENCY`** — Replace “Operational mismatch” and normalization/reconciliation jargon with plain-language pack/weight interpretation guidance; fix misleading €/kg evidence displayed as “kg”.
2. **`OCR_QUANTITY_MISMATCH`** — Remove OCR/Pass-C terminology from badge and description; explain that two reads of the invoice disagree on quantity.
3. **`MATHEMATICAL_INCONSISTENCY` + `MATHEMATICAL_RECONCILIATION_FAILURE`** — Unify owner-facing math copy; drop “reconcile/inconsistency”; label evidence as calculated vs invoice line total.

---

## Review criteria (applied to every finding)

| # | Question |
|---|----------|
| 1 | Would a restaurant owner understand it? |
| 2 | Does it explain **what** is wrong? |
| 3 | Does it explain **why** it is wrong? |
| 4 | Does it explain **what** should be reviewed? |
| 5 | Does it avoid internal engineering terminology? |

---

## Cross-cutting renderer & evidence issues

These affect multiple findings and should be addressed alongside per-finding copy.

| Issue | Where | Impact | Suggested fix |
|-------|-------|--------|---------------|
| Generic **Expected / Actual** labels | `render-finding.tsx` | Owner cannot tell whether “Expected” means invoice, calculated, or OCR | Prefer semantic labels in evidence model or per-category defaults: “Calculated line total”, “Invoice line total”, “Quantity from PDF scan”, etc. |
| **Field** row shows raw keys (`quantity`, `ingredient`, `unit_price`) | `render-finding.tsx` | Engineering vocabulary | Hide `field` from hover UI or map to “Missing field: Quantity” |
| **`expected: { value: "present" }`** | extraction findings | “Expected: present” is meaningless to owners | Use human labels: “Required: filled in” / show only the missing values |
| **`check` extra** (`pack_structure_vs_row_weight`, `display_operational_vs_invoice`) | operational evidence | Internal debug slugs visible as “Check: …” | Omit from UI or map to short owner text |
| **`pack_structure` JSON blob** | operational evidence | Unreadable | Render as “7 units × 1.5 kg each” (or hide until formatted) |
| **Operational €/kg shown as “10.83 kg”** | operational evidence | Values are **price per kg**, unit is `kg` — reads as weight | Use unit `EUR/kg` or label “Price per kg (invoice)” vs “Price per kg (from product name)” |

### `humanize-evidence-key.ts` mapping review

| Key | Current label | Assessment | Suggested label |
|-----|---------------|------------|-----------------|
| `check` | Check | Poor — value is engineering slug | Hide or “Review type” with translated value |
| `confidence` | Confidence | OK | Keep |
| `invoice_implied_cost` | Invoice implied cost | Jargony | “Price per unit (from invoice)” |
| `item_name` | Item name | Good | Keep |
| `line_total` | Line total | Good | Keep |
| `pack_structure` | Pack structure | OK label, bad value (JSON) | Keep label; format value |
| `purchased_weight_kg` | Purchased weight | Good | Add unit in formatted value: “6 kg” |
| `quantity` | Quantity | Good | “Invoice quantity” when operational context |
| `row_unit` | Row unit | Jargony | “Invoice unit” |
| `structure_usable_kg` | Calculated usable quantity | Good intent | “Weight from product name” + “10.5 kg” |
| `suggested_ingredient` | Suggested ingredient | Excellent | Keep |
| `unit` | Unit | Good | “Invoice unit” |
| `unit_price` | Unit price | Good | Keep |
| `usable_quantity` | Usable quantity | Ambiguous alone | “Pack size (raw)” — pair with unit row |
| `usable_quantity_unit` | Usable quantity unit | OK | Merge into usable quantity display |
| `total` | *(fallback)* Total | Good | “Invoice total” |
| *(missing)* `ocr_quantity` | — | Would humanize to “Ocr quantity” | “Quantity on PDF” |
| *(missing)* `pass_c_quantity` | — | Would humanize to “Pass c quantity” | “Quantity entered” |

### Renderer row labels (`render-finding.tsx`)

| Current | Suggested (math/amount findings) | Suggested (operational) |
|---------|----------------------------------|-------------------------|
| Expected | Calculated line total | Price per kg (invoice) |
| Actual | Invoice line total | Price per kg (from name) |
| Difference | Amount off | Price difference |
| Difference % | Percent off | Percent off |
| Field | *(hide or humanize)* | *(hide)* |

---

## Per-finding review

### 1. `PLACEHOLDER_ITEM_NAME` (extraction)

| | Current | Suggested |
|---|---------|-----------|
| **Title** | Missing name | **Keep** — clear |
| **Description** | Extracted item name is missing or unusable. | **We couldn't read a product name for this line.** |
| **Suggested action** | Enter the product name from the invoice. | **Keep** — excellent |
| **Confidence** | **High** — already strong |

**Evidence**

| Row | Quality | Improvement |
|-----|---------|-------------|
| Expected: product name | Good | — |
| Actual: unknown | Good | Show em dash if empty |
| Field: name | Technical | Omit or “Problem: product name” |

**UX scores:** What ✓ · Why △ (doesn't say OCR failed) · Review ✓ · Jargon △ (“extracted”)

---

### 2. `MISSING_QUANTITY_UNIT` (extraction)

| | Current | Suggested |
|---|---------|-----------|
| **Title** | Quantity check | **Missing quantity or unit** |
| **Description** | Quantity or unit is missing and could not be inferred from the line. | **This line is missing a quantity or unit, and we couldn't work it out from the product name.** |
| **Suggested action** | Confirm quantity and unit from the invoice. | **Keep** |
| **Confidence** | **Medium** — title is vague |

**Evidence**

| Row | Quality | Improvement |
|-----|---------|-------------|
| Expected: present | Poor | Remove; show “Status: missing” |
| Quantity / Unit in extra | Good | Label “Invoice quantity” / “Invoice unit” |
| Field: quantity | Technical | Hide |

**UX scores:** What △ · Why △ · Review ✓ · Jargon △ (“inferred”)

---

### 3. `MISSING_AMOUNT` (extraction)

| | Current | Suggested |
|---|---------|-----------|
| **Title** | Missing amount | **Missing price or total** |
| **Description** | Unit price or line total is missing. | **Keep** (or: “Unit price or line total is missing from this row.”) |
| **Suggested action** | Fill in unit price and line total from the invoice. | **Keep** |
| **Confidence** | **High** |

**Evidence**

| Row | Quality | Improvement |
|-----|---------|-------------|
| Expected: present | Poor | Same as quantity finding |
| Unit price / total in extra | Good | Prefix “Invoice unit price”, “Invoice total” |

**UX scores:** What ✓ · Why ✓ · Review ✓ · Jargon ✓

---

### 4. `MATHEMATICAL_RECONCILIATION_FAILURE` (mathematics, extraction validator)

| | Current | Suggested |
|---|---------|-----------|
| **Title** | Math mismatch | **Review invoice math** |
| **Description** | Quantity × Unit Price does not reconcile with Line Total | **Quantity × unit price doesn't match the line total on the invoice (€{variance} off, {pct}%).** *(template with evidence)* |
| **Suggested action** | Reconcile quantity, unit price, and line total. | **Check quantity, unit price, and line total against the invoice — one of them is likely wrong.** |
| **Confidence** | **Medium** |

**Evidence**

| Row | Quality | Improvement |
|-----|---------|-------------|
| Expected / Actual (EUR) | Good numbers | Rename to “Calculated total” / “Invoice total” |
| Difference / Difference % | Good | “Amount off” / “Percent off” |
| Quantity, Unit price | Good | Keep |

**UX scores:** What △ · Why △ (no numbers in description) · Review △ (“reconcile”) · Jargon △

**Note:** Often coexists with `MATHEMATICAL_INCONSISTENCY` on the same row (Gorgonzola). Owners may see two similar math badges — consider distinct severity copy or deduplication in a future pass.

---

### 5. `OCR_QUANTITY_MISMATCH` (extraction)

| | Current | Suggested |
|---|---------|-----------|
| **Title** | OCR qty mismatch | **Review quantity** |
| **Description** | Extracted quantity differs materially from OCR quantity | **The quantity we read from the PDF ({ocr}) doesn't match the quantity on this row ({entered}) — about {pct}% apart.** |
| **Suggested action** | Confirm quantity against the invoice PDF. | **Keep** — best line in this finding |
| **Confidence** | **Low** — highest jargon density |

**Evidence**

| Row | Quality | Improvement |
|-----|---------|-------------|
| Expected (ocr_quantity) | Misleading label | “Quantity on PDF” |
| Actual (pass_c_quantity) | Misleading label | “Quantity on row” |
| Difference % | Good | “Difference” |

**UX scores:** What △ · Why ✗ (OCR unexplained) · Review ✓ · Jargon ✗

---

### 6. `MATHEMATICAL_INCONSISTENCY` (mathematics)

| | Current | Suggested |
|---|---------|-----------|
| **Title** | Math inconsistency | **Review invoice math** |
| **Description** | Quantity × unit price does not reconcile with line total | **Quantity × unit price doesn't match the line total — the numbers on this row don't add up.** |
| **Suggested action** | Correct quantity, unit price, or line total so the row reconciles. | **Fix quantity, unit price, or line total to match the invoice.** |
| **Confidence** | **Medium** |

**Evidence:** Same as `MATHEMATICAL_RECONCILIATION_FAILURE` — good numeric evidence, weak labels.

**UX scores:** What △ · Why △ · Review △ · Jargon △ (“inconsistency”, “reconcile”)

**Rename note:** Align title with `MATHEMATICAL_RECONCILIATION_FAILURE` (“Review invoice math”) but keep error severity visually distinct.

---

### 7. `OPERATIONAL_NORMALIZATION_INCONSISTENCY` (operational)

**Two sub-variants share one code and badge title — copy should diverge by variant.**

#### 7a. Variant `display_operational_vs_invoice`

| | Current | Suggested |
|---|---------|-----------|
| **Title** | Operational mismatch | **Review pack interpretation** |
| **Description** | Normalized operational cost does not reconcile with invoice line economics. | **The price per {kg/L} implied by the invoice doesn't match how we interpreted the pack size from the product name.** |
| **Suggested action** | Review pack structure and usable quantity normalization for this line. | **Check how many packs/units you bought and the size on the label — the invoice price per {unit} may be using a different assumption.** |
| **Confidence** | **Low** |

**Evidence:** Expected/actual are €/kg (or €/L) but render as “X kg” — **critical confusion**.

#### 7b. Variant `pack_structure_vs_row_weight` (e.g. Guanciale)

| | Current | Suggested |
|---|---------|-----------|
| **Title** | Operational mismatch | **Review pack interpretation** *(or **Review weight vs packs**)* |
| **Description** | Pack structure normalization does not reconcile with invoice weight economics. | **The weight in the product name (~{structureKg} kg) doesn't match the billed quantity ({purchasedKg} kg), so the per-kg price looks wrong.** |
| **Suggested action** | Confirm whether row quantity is billed weight or whether pack notation should scale usable stock. | **Check the invoice: is this line priced by total weight billed, or by number of packs? Update quantity or pack size accordingly.** |
| **Confidence** | **Low** |

**Evidence (Guanciale example)**

| Row | Current display | Problem | Improvement |
|-----|-----------------|---------|-------------|
| Expected | 10.83 kg | Looks like weight; is €/kg | “10.83 EUR/kg (from invoice)” |
| Actual | 6.18 kg | Same | “6.18 EUR/kg (from product name)” |
| Check | pack_structure_vs_row_weight | Engineering | Hide |
| Calculated usable quantity | 10.5 | OK | “10.5 kg (from name)” |
| Purchased weight | 6 | OK | “6 kg (on invoice)” |
| Pack structure | `{...JSON...}` | Unreadable | “7 units × 1.5 kg” |
| Usable quantity | 10500 | Raw grams | “10.5 kg” combined |
| Row unit | un | Jargony | “Invoice unit: units (un)” |

**UX scores:** What ✗ · Why ✗ · Review △ (action is closest to good) · Jargon ✗

---

### 8. `UNMATCHED_INGREDIENT` (matching)

| | Current | Suggested |
|---|---------|-----------|
| **Title** | Unmatched ingredient | **Keep** |
| **Description** | This line is not linked to a catalog ingredient. | **This invoice line isn't linked to an ingredient in your list yet.** |
| **Suggested action** | Match or create a canonical ingredient. | **Pick an existing ingredient or add a new one for this product.** |
| **Confidence** | **Medium** |

**Evidence**

| Row | Quality | Improvement |
|-----|---------|-------------|
| Expected: catalog match | Jargony | “Expected: linked ingredient” |
| Item name | Good | Keep |
| Field: ingredient | Technical | Hide |

**UX scores:** What ✓ · Why ✓ · Review △ · Jargon △ (“catalog”, “canonical”)

---

### 9. `SUGGESTED_INGREDIENT_MATCH` (matching)

| | Current | Suggested |
|---|---------|-----------|
| **Title** | Suggested match | **Keep** |
| **Description** | A possible ingredient match needs confirmation. | **Keep** (optional: “We think this line is **{name}** — please confirm.”) |
| **Suggested action** | Confirm or change the suggested ingredient match. | **Keep** |
| **Confidence** | **High** — reference quality for other findings |

**Evidence:** Suggested ingredient + confidence — clear and actionable.

**UX scores:** What ✓ · Why ✓ · Review ✓ · Jargon ✓

---

## Findings already considered excellent

| Code | Why |
|------|-----|
| `SUGGESTED_INGREDIENT_MATCH` | Plain title, clear description, actionable suggestion, readable evidence |
| `MISSING_AMOUNT` | Direct problem statement and action; only minor evidence-label polish |
| `PLACEHOLDER_ITEM_NAME` | Short, obvious problem; suggested action is perfect |

**Honourable mention:** `MISSING_QUANTITY_UNIT` suggested action is strong; title and “present” evidence hold it back from “excellent”.

---

## Summary table

| Code | Title OK? | Description OK? | Action OK? | Evidence OK? | Overall confidence |
|------|-----------|------------------|------------|--------------|-------------------|
| `PLACEHOLDER_ITEM_NAME` | ✓ | △ | ✓ | △ | High |
| `MISSING_QUANTITY_UNIT` | ✗ | △ | ✓ | ✗ | Medium |
| `MISSING_AMOUNT` | ✓ | ✓ | ✓ | △ | High |
| `MATHEMATICAL_RECONCILIATION_FAILURE` | △ | △ | △ | △ | Medium |
| `OCR_QUANTITY_MISMATCH` | ✗ | ✗ | ✓ | ✗ | Low |
| `MATHEMATICAL_INCONSISTENCY` | △ | △ | △ | △ | Medium |
| `OPERATIONAL_NORMALIZATION_INCONSISTENCY` | ✗ | ✗ | △ | ✗ | Low |
| `UNMATCHED_INGREDIENT` | ✓ | △ | △ | △ | Medium |
| `SUGGESTED_INGREDIENT_MATCH` | ✓ | ✓ | ✓ | ✓ | High |

**Needs improvement:** 6 codes (`MISSING_QUANTITY_UNIT`, `OCR_QUANTITY_MISMATCH`, `OPERATIONAL_NORMALIZATION_INCONSISTENCY`, `MATHEMATICAL_RECONCILIATION_FAILURE`, `MATHEMATICAL_INCONSISTENCY`, `UNMATCHED_INGREDIENT`)  
**Excellent:** 3 codes (`SUGGESTED_INGREDIENT_MATCH`, `MISSING_AMOUNT`, `PLACEHOLDER_ITEM_NAME`)

---

## Recommended implementation order

1. **Operational evidence units** — fix €/kg vs kg display (blocks owner comprehension regardless of copy).
2. **Operational + OCR titles/descriptions** — highest jargon and lowest comprehension scores.
3. **Math finding copy unification** — shared evidence shape makes one label pass apply to both math codes.
4. **humanize-evidence-key + hide `field`/`check`** — quick wins across extraction and matching.
5. **Variant-specific operational titles** — same badge for two different problems today.

---

## Files reviewed

- `src/lib/invoice-validation/validators/extraction.ts`
- `src/lib/invoice-validation/validators/mathematics.ts`
- `src/lib/invoice-validation/validators/operational.ts`
- `src/lib/invoice-validation/validators/matching.ts`
- `src/lib/invoice-validation/presentation.ts`
- `src/lib/invoice-validation/humanize-evidence-key.ts`
- `src/lib/invoice-validation/render-finding.tsx`
- `src/lib/invoice-validation/format-evidence-value.ts`
- `src/lib/invoice-extraction-review.ts` (shared math/OCR messages)
- `.tmp/validation-finding-renderer/IMPLEMENTATION.md`
- `.tmp/validation-finding-model-v2/IMPLEMENTATION.md`
