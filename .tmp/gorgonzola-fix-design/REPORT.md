# Gorgonzola Structured Extraction Fix — Design Only

**Validation Lab:** `bjhnlrgodcqoyzddbpbd` · **Mode:** STRICT DESIGN ONLY · **Date:** 2026-06-24  
**No code changes · No DB writes · No deployments**

## Executive summary

Pass C (Hybrid H / `invoice-table-extraction.ts`) hallucinated **qty 1.05** and **unit_price 10.88** while correctly copying **line_total_net 13.44**. Downstream binding, normalization, and persistence are lossless pass-through. The prompt already contains a correct Gorgonzola example (L107–108) yet v28 still failed — **prompt-only is insufficient**.

**Recommended fix:** **C) Prompt + validation** — a minimal prompt delta targeting fractional digit fidelity and mandatory Emporio discount columns, plus a deterministic math guard in `bindMonetaryColumns` and a UI confirmation gate before cost propagation.

**Final verdict:** **C**

---

## Known facts (ground truth)

| Source | Qty | Unit price | Total | Reconciles? |
|--------|-----|------------|-------|-------------|
| PDF | 1.35 kg | net €9.95 (gross €12.90 − 22.85%) | €13.44 | YES |
| OCR pass-c-raw | 1.35 | €9.82 | €13.44 | NO (OCR net slip) |
| Structured v28 / DB | **1.05** | **€10.88** | €13.44 | **NO** (11.42 ≠ 13.44) |

Corpus: **52** VL `invoice_items`, **1** confirmed extraction bug (Gorgonzola), isolated.

---

## T1 — Extraction prompt and response format trace

### Pass C vs Hybrid H

| Aspect | Pass C (legacy) | Hybrid H (current Pass C) |
|--------|-----------------|---------------------------|
| Location | `.tmp/passc-prompt-audit/passc-prompt.txt` | `supabase/functions/extract-invoice/invoice-table-extraction.ts` |
| System prompt | `TABLE_EXTRACTION_SYSTEM_PROMPT` (L18–268) | Same |
| User message | "Extract all invoice line items…" | "Extract each visible invoice line item. Copy quantity, gross_unit_price, discount_pct, and line_total_net from their labeled table columns." (L406) |
| GPT schema | `{ name, quantity, unit, unit_price, total }` | `{ name, quantity, unit, gross_unit_price, discount_pct, line_total_net }` strict JSON schema (L271–307) |
| Qty semantics | Infer from description allowed | Column-only; pack metadata NOT qty |
| Monetary semantics | `unit_price` + `total` authoritative | Column-faithful gross / discount / net total |
| Post-GPT pipeline | `parseMonetaryLineItems` → `bindMonetaryColumns` → `reconcileLineItemAmounts` | Same (L415–418) |

### Pipeline handoff (Gorgonzola)

```
cropped table image
  → callOpenAiJson(TABLE_EXTRACTION_SYSTEM_PROMPT, TABLE_EXTRACTION_RESPONSE_FORMAT)
  → parseMonetaryLineItems(parsed.items)
  → bindMonetaryColumns(...)
  → reconcileLineItemAmounts(...)
  → monetaryToInvoiceLineItem → API response
  → invoices.tsx: normalizeInvoiceItemFields → insert invoice_items
```

### Response format (Hybrid H)

```json
{
  "items": [{
    "name": "string",
    "quantity": "number | null",
    "unit": "string | null",
    "gross_unit_price": "number | null",
    "discount_pct": "number | null",
    "line_total_net": "number | null"
  }]
}
```

`unit_price` and `total` are **not** in the GPT schema. Persisted API shape exposes derived `unit_price` / `total` after binding.

---

## T2 — Why the model selected 1.05 and 10.88

### Quantity 1.05 — hypothesis with evidence

| Hypothesis | Evidence | Confidence |
|------------|----------|------------|
| **Digit misread 1,35 → 1,05** (3↔5 in fractional Qtd) | PDF and OCR both have 1.35; first wrong value at v28 Pass C; description `~1,5kg` did NOT become 1.5; prompt L119–125 mandates exact fractional copy | **HIGH** |
| Pack metadata override | Prompt L65–69 forbids; Qtd column visible in crop | LOW |
| Description weight `1,8-1,9kg` bleed | Would suggest ~1.8–1.9, not 1.05 | LOW |

**Mechanism:** Vision OCR on dense Emporio row misread the second decimal digit of **1,35** as **0** (or fused **3** into **0**), yielding **1,05**. Prompt already warns against rounding (L119–125) and includes correct Gorgonzola qty (L107) — insufficient alone.

### Unit price 10.88 — hypothesis with evidence

| Candidate origin | Value | Matches? |
|------------------|-------|----------|
| PDF gross Preço Unit | €12.90 | NO |
| PDF net (post-discount) | €9.95 | NO |
| OCR pass-c-raw | €9.82 | NO |
| 13.44 ÷ 1.05 | €12.80 | NO |
| 13.44 ÷ 1.35 | €9.96 ≈ net | NO (qty wrong) |
| Desc.(%) column | 22.85 | NO |
| **Emitted unit_price / mis-bound gross** | **10.88** | **YES (only match)** |

| Hypothesis | Evidence | Confidence |
|------------|----------|------------|
| **Structured columns skipped; wrong price in gross/legacy slot** | Inferred pre-bind: `gross_unit_price=null`, `discount_pct=null`, `line_total_net=13.44`, `unit_price=10.88`. `applyStructuredBinding` would set `unit_price = gross_unit_price` when discount null (L69–70). Discount cols absent → `deriveNetUnitPrice` never runs | **HIGH** |
| Partial digit drift on 12,90 → 10,88 | Leading **12→10** class of OCR slip; 10.88 absent from all OCR artifacts | MEDIUM |
| Column confusion (Desc/net bleed) | 10.88 ≠ 22.85; VALOR 13.44 copied correctly — asymmetric failure | MEDIUM |
| `applyEffectivePaidPrice` correction | Requires `total < qty×unit_price` (L117); here 13.44 **>** 11.42 — skipped | CONFIRMED N/A |

**Mechanism:** Model copied **line_total_net** correctly (VALOR isolation worked) but failed to populate **gross_unit_price** and **discount_pct**, instead emitting an invented **unit_price** (or wrong **gross_unit_price**) of **10.88**. `bindMonetaryColumns` pass-through because discount columns null and inverse gross-over-net guard does not fire.

---

## T3/T4 — Design options (risk / blast radius / effectiveness)

### Option A — Prompt-only

**Design:** Add fractional digit guard (3↔5), strengthen "Desc.(%) never null when visible", duplicate Gorgonzola negative example for 1,05/10.88.

| Dimension | Assessment |
|-----------|------------|
| **Effectiveness** | **LOW** — correct Gorgonzola example already at L107–108; v28 still failed |
| **Blast radius** | Minimal — prompt text only |
| **Risk** | Low regression risk; **high residual risk** (no safety net) |
| **VL impact** | 52/52 unchanged if model complies; 0/52 protected if model repeats failure |
| **Preserves controls** | N/A — no deterministic guard |

### Option B — Validation-only

**Design:** Math reconciliation without prompt changes.

**B1 — Extend `applyEffectivePaidPrice` bidirectionally**  
When `|qty×unit_price − total| > ε` and `total > qty×unit_price`, set `unit_price = total/qty`.

| Dimension | Assessment |
|-----------|------------|
| **Effectiveness on Gorgonzola** | **PARTIAL** — yields €12.80/kg (still ≠ net €9.95; qty still 1.05) |
| **Blast radius** | All Emporio discounted rows where binding already correct |
| **Risk** | Prosciutto/Mortadella/Bresaola safe if already reconciling; could mask future gross-as-net errors |

**B2 — Persist / UI gate: `needsMathConfirmation`**  
Flag when `|qty×unit_price − total| > max(€0.50, 5%)`.

| Dimension | Assessment |
|-----------|------------|
| **Effectiveness** | **CATCHES** Gorgonzola (15.03%); does not auto-correct |
| **Blast radius** | 1 CRITICAL + 0 false positives at 5% on VL corpus |
| **Risk** | Blocks silent cost ingest; user must confirm |

**B3 — Structured formula check in `bindMonetaryColumns`**  
When `gross_unit_price`, `discount_pct`, `line_total_net` all present: verify `qty × gross × (1 − disc/100) ≈ total`; on fail, force `deriveNetUnitPrice`.

| Dimension | Assessment |
|-----------|------------|
| **Effectiveness on Gorgonzola** | **NO** when discount cols null (actual failure mode) |
| **Effectiveness on controls** | Strengthens Prosciutto/Mortadella/Bresaola path when structured cols present |
| **Risk** | Low — only fires when structured cols populated |

### Option C — Prompt + validation (combination)

**Design:** Minimal prompt delta (A) + B2 UI gate + B3 structured rebind + narrow B1 only when structured cols missing.

| Dimension | Assessment |
|-----------|------------|
| **Effectiveness** | **HIGH** — reduces recurrence + prevents silent persist of 15% error |
| **Blast radius** | 1 row flagged in VL; 0 control regressions at designed thresholds |
| **Risk** | Low — layered; prompt does not remove existing examples |
| **Preserves controls** | Prosciutto 4.3×8.50≈36.54 ✓ · Mortadella 3.11×8.88≈27.57 ✓ · Bresaola 1.83×27.04=49.48 ✓ · 51/51 other VL rows SAFE at 5% |

### Option D — Other

| Variant | Notes |
|---------|-------|
| Row-level re-extract on math fail | Higher cost; non-deterministic; defer unless C insufficient |
| OCR cross-check for Qtd column | Requires second signal path; larger scope |
| Block legacy `unit_price` in `parseMonetaryLineItems` | Good hardening; does not fix qty misread |

---

## T5 — Math validation design

### Proposed guard (recommended)

```
lineExtension = qty × unit_price
variance_abs = |lineExtension − total|
variance_pct = variance_abs / total
needsMathConfirmation = variance_abs > max(€0.50, 5% of total)
```

### VL corpus replay

| Product | Qty×Price | Total | Variance | Caught at 5%? | Classification |
|---------|-----------|-------|----------|---------------|----------------|
| **Gorgonzola** | 11.42 | 13.44 | €2.02 (15.03%) | **YES** | Confirmed bug |
| Aceto balsamico 5l*2 | 15.55 | 16.09 | €0.54 (3.36%) | NO | Legitimate discount semantics |
| ACQUA S.PELLEGRINO (Bocconcino) | 41.94 | 42.07 | €0.13 (0.31%) | NO | Legitimate discount |
| SanPellegrino Emporio v28 | 38.56 | 38.56 | €0 | NO | Control — correct |
| Prosciutto | 36.55 | 36.54 | €0.01 | NO | Control |
| Mortadella | 27.62 | 27.57 | €0.05 | NO | Control |
| Bresaola | 49.48 | 49.48 | €0 | NO | Control |

### False-positive analysis

| Case | Would naive €0.02 gate catch? | Would 5% gate catch? | Mitigation |
|------|------------------------------|----------------------|------------|
| Aceto | YES (3.36%) | NO | Threshold >3%; optional structured-col exemption |
| Pellegrino (Bocconcino) | YES (0.31%) | NO | Well within tolerance |
| Pellegrino (Emporio v28) | NO | NO | Already reconciles |
| Weighted produce (Manjericão, etc.) | Some at €0.02 | NO | Sub-1% micro-variance |

**Conclusion:** A **5% + €0.50 floor** gate catches Gorgonzola exclusively among material VL rows. Aceto/Pellegrino are **not** false positives at this threshold.

### Structured binding enhancement (Rule F)

When `gross_unit_price`, `discount_pct`, and `line_total_net` are all non-null:

```
expected = round2(qty × gross × (1 − discount_pct/100))
if |expected − line_total_net| > €0.05:
  unit_price = deriveNetUnitPrice(gross, discount)
  total = line_total_net
```

**Gorgonzola with correct structured input** (per persistence-reconciliation audit replay): qty 1.35, gross 12.90, discount 22.85, total 13.44 → unit_price **9.95**, reconciles **YES**.

**Gorgonzola actual failure** (discount cols null): Rule F does not fire — hence prompt delta mandating Desc.(%) extraction is required alongside validation.

---

## T6 — Recommended single fix (smallest safe)

### Preferred: **Option C** — three minimal changes

#### 1. Prompt delta (~12 lines, `invoice-table-extraction.ts`)

Insert after L125 (FRACTIONAL QUANTITIES):

- **FRACTIONAL DIGIT GUARD:** Emporio Qtd `1,35` is **1.35 kg**, NOT `1,05` — read both decimal digits; 3 and 5 are distinct.
- **EMPORIO DISCOUNT MANDATORY:** When Preço Total < Qtd × Preço Unit, Desc.(%) MUST be populated — never leave `discount_pct` null on discounted Emporio rows.
- **NEGATIVE:** Gorgonzola with Qtd `1,05`, unit `10,88`, total `13,44` → **BAD** (1,05×10,88≠13,44).

Do **not** remove existing positive Gorgonzola example (L107–108).

#### 2. `bindMonetaryColumns` Rule F (`invoice-monetary-binding.ts`)

Structured formula verification + rebind when gross+discount+total present but `unit_price` inconsistent. No change to `applyEffectivePaidPrice` direction predicate.

#### 3. `needsMathConfirmation` (`invoices.tsx` ~L518)

Extend `needsExtractionConfirmation`:

```typescript
const needsMathConfirmation = (item) => {
  const { quantity: qty, unit_price, total } = item;
  if (qty == null || qty <= 0 || unit_price == null || total == null) return false;
  const variance = Math.abs(qty * unit_price - total);
  return variance > Math.max(0.5, total * 0.05);
};
```

Wire into existing confirmation UI — **does not block row insert** but **blocks auto ingredient cost persist** until confirmed (aligns with `needsExtractionConfirmation` pattern).

### Why not A or B alone?

| Verdict | Rationale |
|---------|-----------|
| **A insufficient** | Proven: prompt already contains correct Gorgonzola row |
| **B insufficient alone** | Cannot recover qty 1.35 from math when both qty and unit_price wrong; B2 catches but does not fix |
| **C smallest safe** | Prompt targets root failure mode; deterministic guards catch recurrence; 0 control regressions at 5% |

### Control preservation checklist (v28 Emporio extract)

| Row | qty×unit_price vs total | After Rule F + 5% gate |
|-----|-------------------------|------------------------|
| Prosciutto 4.3 / 8.50 / 36.54 | Δ €0.01 | PASS |
| Mortadella 3.11 / 8.88 / 27.57 | Δ €0.05 | PASS |
| Bresaola 1.83 / 27.04 / 49.48 | Δ €0 | PASS |
| SanPellegrino 2 / 19.28 / 38.56 | Δ €0 | PASS |
| Gorgonzola 1.05 / 10.88 / 13.44 | Δ €2.02 | **FLAG** |

---

## Persist path reference

```
extractTableItemsFromImage (Pass C)
  → bindMonetaryColumns / reconcileLineItemAmounts
  → extract-invoice API response
  → invoices.tsx runExtraction (L1398–1469)
      → normalizeInvoiceItemFields (no-op for Gorgonzola)
      → insertRows → supabase.from("invoice_items").insert
      → autoPersistUnmatchedInvoiceItems (propagates unit_price to ingredient)
```

No persist-time math validation exists today (`mathematical-consistency-coverage-audit` Task 6).

---

## Implementation scope (out of scope for this design)

| File | Change |
|------|--------|
| `supabase/functions/extract-invoice/invoice-table-extraction.ts` | Prompt delta |
| `supabase/functions/extract-invoice/invoice-monetary-binding.ts` | Rule F |
| `src/routes/invoices.tsx` | `needsMathConfirmation` |
| Tests | Rule F unit tests; VL replay Gorgonzola + 3 controls |

**Estimated diff:** ~60–80 lines. No schema migration. No DB backfill required (design-only).

---

## FINAL VERDICT

| Choice | Verdict |
|--------|---------|
| A) Prompt-only | ❌ Insufficient (proven) |
| B) Validation-only | ⚠️ Catches but cannot correct; incomplete |
| **C) Prompt + validation** | **✅ RECOMMENDED** |
| D) Other | Defer re-extract / OCR cross-check unless C fails VL replay |

**Selected: C**

---

## Artifact index

- `.tmp/gorgonzola-structured-extraction-failure-audit/`
- `.tmp/gorgonzola-unit-price-origin-audit/`
- `.tmp/gorgonzola-persistence-reconciliation-audit/`
- `.tmp/mathematical-consistency-coverage-audit/`
- `.tmp/final-validation-lab-rerun-v28/extracts/17aa3591-ec98-4c21-89c9-5ae946bc97bb.json`
- `supabase/functions/extract-invoice/invoice-table-extraction.ts`
- `supabase/functions/extract-invoice/invoice-monetary-binding.ts`
- `supabase/functions/extract-invoice/invoice-line-reconcile.ts`
- `src/routes/invoices.tsx`

Machine-readable: `design.json`
