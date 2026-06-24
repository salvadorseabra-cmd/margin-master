# Invoice Unit Persistence Audit

**Validation Lab:** `bjhnlrgodcqoyzddbpbd`  
**Mode:** STRICT READ-ONLY — no code/DB writes, deployments, or fixes  
**Audited:** 2026-06-23

## Executive Summary

Paccheri Lisci and Ginger Beer lose `invoice_items.unit` because **GPT Pass C often omits the unit column** for Emporio countable rows whose product names embed weight/volume (`500g`, `0.20cl`), and **`resolveInvoicePersistedItemUnit` cannot backfill `un`** when OCR unit is null and structured purchase format is `weight_or_volume` (not `multi_unit_pack`).

Peroni, Pellegrino, Pomodori, and Açúcar preserve unit because their names carry **multipack markers** (`33cl*24`, `CX 75CL*15`, `CX 2,5KG*6`, `10x1Kg`) → `multi_unit_pack` → resolver infers `un` or preserves explicit `cx` **even when OCR unit is null**.

Historical evidence: the deleted Emporio invoice `17aa3591` (2026-06-10) persisted `unit=un` for both affected rows. Live invoice `ab52796d` rows (re-inserted 2026-06-20) have `unit=null`. GPT can return `un` (frozen extracts confirm), but the extract runs that produced `ab52796d` handed off `unit=null`.

**Verdict:** **READY**  
**First incorrect stage:** **GPT Pass C unit omission** compounded by **`resolveInvoicePersistedItemUnit` fallback_null** on `weight_or_volume` rows when OCR unit is absent  
**Classification:** **D) Mixed** — extraction variance + client resolution gap (not active insert corruption when unit is present)

---

## Required Table

| Product | Extracted Qty | Extracted Unit | Persisted Qty | Persisted Unit | First Incorrect Stage | Classification |
|---------|---------------|----------------|---------------|----------------|----------------------|----------------|
| Paccheri Lisci | 24 | null (ab52796d upload) | 24 | null | GPT Pass C | Extraction |
| Ginger Beer (Baladin) | 24 | null (ab52796d upload) | 24 | null | GPT Pass C | Extraction |
| Peroni Nastro Azzurro 33cl | 24 | un | 24 | un | none | OK |
| Pellegrino 75cl×15 | 2 | un | 2 | un | none | OK |
| Açúcar Branco 10x1kg | 1 | cx | 1 | cx | none | OK |
| Pomodori 2.5kg×6 | 1 | un | 1 | un | none | OK |

*Note: SanPellegrino on the same Emporio invoice `ab52796d` also has `unit=un` in DB — only Paccheri and Ginger lose unit among countable lines.*

---

## Comparison Table

| Product | Invoice | DB qty | DB unit | Structured kind | OCR null → resolved | OCR `un` → resolved | Last Purchase | Status |
|---------|---------|--------|---------|-----------------|---------------------|---------------------|---------------|--------|
| Paccheri Lisci | ab52796d | 24 | **null** | `weight_or_volume` | **null** | `un` | `24` | DATA_LOSS |
| Ginger Beer | ab52796d | 24 | **null** | `weight_or_volume` | **null** | `un` | `24` | DATA_LOSS |
| Peroni 33cl | Mammafiore | 24 | `un` | `multi_unit_pack` | `un` | `un` | `24 un` | OK |
| Pellegrino 75cl×15 | Bocconcino | 2 | `un` | `multi_unit_pack` | `un` | `un` | `2 un` | OK |
| Açúcar 10x1kg | Aviludo | 1 | `cx` | `multi_unit_pack` | `un`* | `cx` | `1 case` | OK |
| Pomodori | Bocconcino | 1 | `un` | `multi_unit_pack` | `un` | `un` | `1 un` | OK |

\*Açúcar DB has explicit OCR `cx`; resolver preserves via `ocr_explicit`.

---

## Seven Questions

| # | Question | Answer |
|---|----------|--------|
| 1 | Does GPT/extract return `unit` for Paccheri on ab52796d? | **Inconsistent.** Frozen extracts (`.tmp/persistence-audit/pass-c-raw/17aa3591-…`, `.tmp/emporio-italia-investigation/extract-invoice-response.json`) return `unit: "un"`. The ab52796d persist trace (`.tmp/discount-binding-root-cause-output.json` stage 3–5) shows `unit: null` at binding handoff — the run that wrote current rows omitted unit. |
| 2 | Does GPT/extract return `unit` for Ginger Beer on ab52796d? | **Same pattern.** Frozen extracts: `unit: "un"`. ab52796d binding trace: `unit: null`. |
| 3 | Does `resolveInvoiceItemUnit` strip a present OCR unit? | **No** — when OCR supplies `un`, `preserveCountableExtractedUnit` keeps it for both Paccheri and Ginger (`resolved: "un"`). Stripping only occurs when OCR unit is already null. |
| 4 | Does `runExtraction` insert path drop unit? | **No** — `src/routes/invoices.tsx:1446–1457` writes `unit: resolveInvoiceItemUnit(…)` faithfully. `monetaryToInvoiceLineItem` passes unit through unchanged. No post-insert mutation. |
| 5 | Why do Peroni/Pellegrino/Pomodori/Açúcar preserve unit? | Names parse as **`multi_unit_pack`** (`33cl*24`, `CX 75CL*15`, `CX 2,5KG*6`, `10x1Kg`). `resolveInvoiceLinePurchaseUnit` infers `un` (or preserves `cx`) **without requiring OCR unit**. |
| 6 | First stage where unit disappears for Paccheri/Ginger? | **GPT Pass C** when it omits unit → **`resolveInvoicePersistedItemUnit` returns `fallback_null`** because `weight_or_volume` + null OCR cannot infer countable denomination. Persist then stores `null` correctly. |
| 7 | Classification | **D) Mixed** — (A) GPT unit omission on Emporio countable rows + (B) client resolver cannot infer `un` for embedded-measure countables without multipack name pattern. UI correctly shows bare quantity via `formatRowPurchaseQuantityLabel`. |

---

## Full Pipeline Trace

### Paccheri Lisci / Ginger Beer (DATA_LOSS path)

```
PDF (Emporio) — Qtd column 24,00; no separate unit column visible on some layouts
    ↓
GPT Pass C (invoice-table-extraction.ts)
    → Paccheri: qty=24, unit="un" OR unit=null (run-dependent)
    → Ginger:   qty=24, unit="un" OR unit=null
    ↓
bindMonetaryColumns → monetaryToInvoiceLineItem
    → unit passed through (never stripped)
    ↓
finalizeExtractedLineItems / reconcileLineItemAmounts
    → unit unchanged
    ↓
Client runExtraction (invoices.tsx)
    → normalizeInvoiceItemFields (unit preserved or null)
    → resolveInvoiceItemUnit → resolveInvoicePersistedItemUnit
        IF unit=null + kind=weight_or_volume → null  ← Paccheri/Ginger lose here
        IF unit="un" → "un" (preserveCountableExtractedUnit)
    ↓
invoice_items INSERT
    → ab52796d DB: unit=null (created 2026-06-20T01:25:08)
    ↓
formatRowPurchaseQuantityLabel(metadata)
    → unit null → "24" (bare quantity)
    ↓
Ingredient Detail Last Purchase → "24"
```

### Peroni / Pellegrino / Pomodori / Açúcar (OK path)

```
GPT Pass C → unit often "un"/"cx" OR null
    ↓
resolveInvoiceLinePurchaseFormat → kind=multi_unit_pack
    (name patterns: *24, CX*N, 10x1Kg)
    ↓
resolveInvoicePersistedItemUnit
    → multi_unit_pack + null OCR → "un"
    → explicit cx/kg → preserved
    ↓
invoice_items.unit = "un" or "cx"
    ↓
formatRowPurchaseQuantityLabel → "24 un" / "2 un" / "1 case" / "1 un"
```

---

## Re-read vs Initial Upload

| Path | Code | Unit behavior |
|------|------|---------------|
| Initial upload | `uploadOne` → `runExtraction` | Same insert path |
| Re-read | `reExtract` → `runExtraction` | **Identical** — delete items, re-extract, `resolveInvoiceItemUnit`, insert |

No separate code path strips unit on re-read. The Jun 2026 effective-paid reingest (`.tmp/effective-paid-reingest-result.json`, `generated_at: 2026-06-20T01:25:18`) re-ran extraction on `ab52796d`; sample handoff rows omit `unit` field entirely.

---

## Historical Regression Evidence

| Invoice | Created | Paccheri unit | Ginger unit |
|---------|---------|---------------|-------------|
| `17aa3591` (deleted) | 2026-06-10 | `un` | `un` |
| `ab52796d` (live) | 2026-06-11 header; items 2026-06-20 | **null** | **null** |

Source: `.tmp/emporio-italia-investigation/invoice-items.json` (17aa3591), VL live query (ab52796d).

---

## Code That Nullifies Unit (evidence only)

| Location | Behavior |
|----------|----------|
| `resolveInvoiceLinePurchaseUnit` (`invoice-purchase-format.ts:1496`) | Returns `{ unit: null, source: "fallback_null" }` when OCR unit null and structured kind is `weight_or_volume` |
| `preserveCountableExtractedUnit` | Only fires when OCR unit is non-null generic countable |
| `formatRowPurchaseQuantityLabel` (`invoice-purchase-price-semantics.ts:768–787`) | Returns bare `formatPurchaseCount(qty)` when `metadata.unit` empty — display consequence, not persistence cause |
| `normalizeInvoiceItemFields` | Does **not** strip unit; may extract unit from name tail when OCR provides it |

**No code** actively nullifies a non-null unit at insert time.

---

## Scope

- **Affected:** Emporio countable rows with embedded measure in name (Paccheri `500g`, Ginger `0.20cl`) on `ab52796d`
- **Unaffected:** Multipack-named beverages/groceries (Peroni, Pellegrino, Pomodori, Açúcar)
- **UI impact:** Last Purchase shows `24` instead of `24 un` because UI reads `invoice_items.unit` only

---

## Verdict

| Field | Value |
|-------|-------|
| **First incorrect stage** | GPT Pass C unit omission → `resolveInvoicePersistedItemUnit` `fallback_null` on `weight_or_volume` |
| **Classification** | **D) Mixed** |
| **Scope** | Paccheri + Ginger Beer on Emporio `ab52796d`; multipack-named products unaffected |
| **READY / NOT READY** | **READY** (root cause identified with evidence; fix design may proceed) |

---

## Evidence Files

- `.tmp/invoice-unit-persistence-audit/results.json` — machine-readable audit output
- `.tmp/invoice-unit-persistence-audit/audit.mts` — replay script
- `.tmp/discount-binding-root-cause-output.json` — ab52796d Paccheri unit=null at stages 3–7
- `.tmp/persistence-audit/pass-c-raw/17aa3591-…-extract-invoice.json` — frozen extract unit=`un`
- `.tmp/emporio-italia-investigation/invoice-items.json` — 17aa3591 historical unit=`un`
- `.tmp/effective-paid-reingest-result.json` — Jun 20 reingest timeline
- `src/routes/invoices.tsx` — `runExtraction` / `reExtract`
- `src/lib/invoice-purchase-format.ts` — `resolveInvoicePersistedItemUnit`
