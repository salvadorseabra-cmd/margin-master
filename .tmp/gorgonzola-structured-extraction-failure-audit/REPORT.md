# Gorgonzola Structured Extraction Failure Audit

**Validation Lab:** `bjhnlrgodcqoyzddbpbd` · **Read-only** · 2026-06-24

**Fixture invoice:** `17aa3591-ec98-4c21-89c9-5ae946bc97bb` (Emporio geometry/OCR audits)  
**Persisted invoice:** `ab52796d-de1d-418d-86e7-230c8f056f09` · **Item:** `bece238e-fd6d-493c-8555-6921b164f97c`

## Required question (A–E)

**C)** LLM hallucinated both qty and unit_price

---

## Goal

Why did structured extraction transform valid PDF line **(1.35 kg, net €9.95, total €13.44)** into persisted **(1.05, €10.88, €13.44)**?

---

## TASK 1 — v28 Gorgonzola row raw JSON

Source: `.tmp/final-validation-lab-rerun-v28/extracts/17aa3591-ec98-4c21-89c9-5ae946bc97bb.json`

```json
{
  "name": "Arrigoni Formaggi - Gorgonzola DOP Dolce Linea Castelgrotti 1/8 - 1,8-1,9kg",
  "quantity": 1.05,
  "unit": null,
  "unit_price": 10.88,
  "total": 13.44
}
```

Deploy v28 · extracted 2026-06-12 · `1.05 × 10.88 = 11.42 ≠ 13.44`

---

## TASK 2 — Full pipeline trace

| Step | Stage | Qty | Unit price | Total | Notes |
|------|-------|-----|------------|-------|-------|
| 1 | PDF visible row | 1.35 | net €9.95 (gross €12.90 − 22.85%) | 13.44 | `stage-trace.json` |
| 2 | Image / geometry crop | — | — | — | Row visible; discount values in pixels |
| 3 | Pass C prompt | 1.35 (example) | 12.90 gross | 13.44 | `invoice-table-extraction.ts` L107-108 |
| 4 | GPT raw JSON | **not cached** | — | — | `gptPassCRaw: null` for 17aa3591 |
| 5 | Inferred Pass C handoff | **1.05** | **10.88** | 13.44 | discount cols null; `line_total_net` 13.44 |
| 6 | `parseMonetaryLineItems` → `bindMonetaryColumns` | 1.05 | 10.88 | 13.44 | pass-through |
| 7 | API response (v28 replay) | 1.05 | 10.88 | 13.44 | ≡ DB |
| 8 | `normalizeInvoiceItemFields` | 1.05 | 10.88 | 13.44 | no-op |
| 9 | Persisted `invoice_items` | 1.05 | 10.88 | 13.44 | `bece238e` |

---

## TASK 3 — Raw model output before parsing

**Direct gpt-raw artifact:** **NOT AVAILABLE** for `17aa3591` (no `*-gpt-raw.json` in `.tmp/persistence-audit/pass-c-raw/`; `stage-trace.json` records `gptPassCRaw: null`).

**Did model return 1.05 and 10.88?** **INFERRED YES**

| Evidence | Value |
|----------|-------|
| v28 API output (post-bind) | qty 1.05, unit_price 10.88, total 13.44 |
| DB persisted row | identical trio |
| `bindMonetaryColumns` replay on legacy handoff | pass-through — no derivation of 10.88 from 13.44÷1.05 (=12.80) |
| OCR-era pass-c-raw (2026-06-11) | qty **1.35**, unit_price **9.82** — neither 1.05 nor 10.88 |

**Inferred pre-bind snippet** (only shape consistent with v28 ≡ DB):

```json
{
  "quantity": 1.05,
  "gross_unit_price": null,
  "discount_pct": null,
  "line_total_net": 13.44,
  "unit_price": 10.88,
  "total": 13.44
}
```

**OCR-era contrast** (`.tmp/persistence-audit/pass-c-raw/17aa3591-extract-invoice.json`):

```json
{
  "quantity": 1.35,
  "unit": "kg",
  "unit_price": 9.82,
  "total": 13.44
}
```

---

## TASK 4 — Quantity trace 1.35 → 1.05

| Stage | Qty |
|-------|-----|
| PDF Qtd column | **1.35** |
| pass-c-raw API | **1.35** |
| passc-refinement reextract | **1.35** |
| v28 Pass C / API | **1.05** ← first wrong |
| DB | **1.05** |

**First divergence:** Pass C structured extraction (v28 deploy replay).  
**Mechanism:** GPT digit misread `1,35` → `1,05`; not pack-metadata override (`~1,5kg` in description did not become 1.5).

---

## TASK 5 — Unit price trace 9.95 → 10.88

| Stage | Unit price |
|-------|------------|
| PDF net (12.90 × 0.7715) | **€9.95** |
| pass-c-raw OCR API | **€9.82** |
| emporio-footer extract | **€9.92** |
| v28 Pass C / API | **€10.88** ← first wrong |
| DB | **€10.88** |

**OCR contained 10.88?** **NO** (scanned pass-c-raw, refinement, footer artifacts).

**First divergence:** Pass C structured extraction.  
**Mechanism:** GPT emitted legacy `unit_price` 10.88 with `gross_unit_price`/`discount_pct` null — value matches no PDF column.

---

## TASK 6 — Prompt audit (column confusion? gross vs net?)

**YES — column/schema confusion.**

- Prompt requires `gross_unit_price` from Preço Unit, `discount_pct` from Desc.(%), `line_total_net` from Preço Total.
- Emporio Gorgonzola example (L107-108): qty **1.35**, gross **12.90**, discount **22.85%**, total **13.44**.
- Model output shape: `unit_price` **10.88** pre-filled; discount columns absent at API.
- **10.88** is neither gross (12.90) nor net (9.95) nor OCR (9.82).
- **13.44** total likely correct (VALOR copied) — v28 VALOR isolation worked for total only on this row.
- `bindMonetaryColumns` cannot fix: `applyEffectivePaidPrice` only fires when `total < qty×unit_price`; here total **>** qty×unit_price (13.44 > 11.42).

---

## TASK 7 — Controls (Prosciutto, Mortadella, Bresaola)

Source: v28 extract `17aa3591-ec98-4c21-89c9-5ae946bc97bb.json`

| Product | Qty | Unit price | Total | Qty×price | Reconciles? |
|---------|-----|------------|-------|-----------|-------------|
| Prosciutto Cotto Scelto HC | 4.3 | 8.50 | 36.54 | 36.55 | **YES** |
| Mortadella IGP Massima | 3.11 | 8.88 | 27.57 | 27.62 | **YES** |
| Bresaola Punta d'Anca Oro | 1.83 | 27.04 | 49.48 | 49.48 | **YES** |
| **Gorgonzola DOP Dolce** | **1.05** | **10.88** | **13.44** | **11.42** | **NO** |

Deli controls reconcile; Gorgonzola alone has inconsistent qty×unit_price vs total.

---

## TASK 8 — Exact failure mechanism

1. **PDF is correct:** 1.35 × €12.90 × (1 − 0.2285) = €13.44.
2. **Pass C GPT** misread qty and invented unit_price while copying line total correctly.
3. **Post-processing did not modify:** `bindMonetaryColumns`, `reconcileLineItemAmounts`, `normalizeInvoiceItemFields`, and DB insert are lossless pass-through.
4. **Persistence is faithful** to corrupt structured output — not a binding or normalization bug.

---

## Required table

| Stage | Qty | Unit Price | Total |
|-------|-----|------------|-------|
| PDF (net implied) | 1.35 | 9.95 | 13.44 |
| OCR / pass-c-raw API | 1.35 | 9.82 | 13.44 |
| Pass C inferred pre-bind | 1.05 | 10.88 | 13.44 |
| bindMonetaryColumns | 1.05 | 10.88 | 13.44 |
| v28 API output | 1.05 | 10.88 | 13.44 |
| normalizeInvoiceItemFields | 1.05 | 10.88 | 13.44 |
| Persisted DB | 1.05 | 10.88 | 13.44 |

---

## Final answers

1. **Where did 1.05 first appear?** Pass C structured extraction. Earliest qty-only artifact: `final-stability-audit/run1` (1.05, unit_price 9.88). Persisted trio **(1.05, 10.88, 13.44)** first together at **v28 deploy replay** ≡ DB.

2. **Where did 10.88 first appear?** Pass C structured extraction — **v28 extract** is first workspace artifact containing 10.88 for Gorgonzola (no OCR/pre-v28 artifact has it).

3. **Model or post-processing?** **Model** (GPT Pass C). Post-processing pass-through only.

4. **Exact extraction failure?** GPT returned `quantity=1.05` and `unit_price=10.88` with discount structured columns absent, while `line_total_net=13.44` was correct. Downstream stages propagated unchanged.

---

## Artifact index

- `.tmp/final-validation-lab-rerun-v28/extracts/17aa3591-ec98-4c21-89c9-5ae946bc97bb.json`
- `.tmp/persistence-audit/pass-c-raw/17aa3591-ec98-4c21-89c9-5ae946bc97bb-extract-invoice.json`
- `.tmp/passc-refinement-validation/reextract/17aa3591-ec98-4c21-89c9-5ae946bc97bb.json`
- `.tmp/gorgonzola-root-cause/stage-trace.json`
- `.tmp/gorgonzola-unit-price-origin-audit/`
- `.tmp/gorgonzola-persistence-reconciliation-audit/`
- `supabase/functions/extract-invoice/invoice-table-extraction.ts`
- `supabase/functions/extract-invoice/invoice-monetary-binding.ts`

Machine-readable: `results.json`
