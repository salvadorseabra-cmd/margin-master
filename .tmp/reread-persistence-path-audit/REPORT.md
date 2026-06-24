# Re-read Persistence Path Audit

**Validation Lab:** `bjhnlrgodcqoyzddbpbd`  
**Mode:** STRICT READ-ONLY — no code changes, no DB writes  
**Audited:** 2026-06-23T10:32:00Z  
**Invoice:** Emporio Italia `ab52796d-de1d-418d-86e7-230c8f056f09`

---

## Executive answer

`resolveInvoicePersistedItemUnit` **does execute** on Emporio re-read. It returns **`null`** for Paccheri and Ginger because the persistence call site passes only `{ name, unit }` — **not `quantity`**. The `be21f02` gate `shouldInferUnForEmbeddedMeasureCountable` requires `quantity` integer > 1; without it the gate fails and the resolver falls through to `null`.

**User claim reconciled:** `origin/main` and `local main` are both **`be21f02`** (verified after `git fetch`). Null DB units are **not** explained by a missing git commit or undeployed resolver logic. They match the **actual runtime call shape** at `invoices.tsx:1448`.

**Final verdict: B) Resolver runs but returns null**

---

## Required answers

### 1. Entry point for Re-read

| Field | Value |
|-------|-------|
| UI | Invoice Review → Re-read button / `onExtract` |
| Handler | `reExtract(row)` — `src/routes/invoices.tsx:2393` |
| Preconditions | `row.file_path` present; `isExtractableInvoicePath(file_path)` |

### 2. Function chain executed

```
reExtract(row)
  → createSignedUrl + fetch blob + fileToExtractionDataUrl
  → runExtraction(invoiceId, dataUrl)          [invoices.tsx:1339]
      → supabase.functions.invoke("extract-invoice")
      → normalizeInvoiceItemFields (per item)
      → filter shouldRejectInvoiceIngredientRow
      → DELETE invoice_items WHERE invoice_id
      → insertRows.map → resolveInvoiceItemUnit({ name, unit })   ← resolver
      → INSERT invoice_items
      → syncOperationalIngredientCostsFromInvoiceLines
  → UPDATE invoices metadata
  → loadItems (UI refresh)
```

Re-read and initial upload share **identical** `runExtraction` persistence. Edge `extract-invoice` v38 does **not** insert `invoice_items`.

### 3. Does `resolveInvoicePersistedItemUnit` execute?

**YES**

### 4. Input, output, persistence payload

| Product | Resolver input (actual call site) | Resolver output | Insert payload `unit` | DB `unit` |
|---------|-----------------------------------|-----------------|----------------------|-----------|
| Paccheri | `{ name: "De Cecco - Paccheri Lisci Nr. 125 - 500g", unit: null }` | `null` (`fallback_null`, gate `qtyIntegerGt1: false`) | `null` | `null` |
| Ginger Beer | `{ name: "Baladin - Ginger Beer 0.20cl", unit: null }` | `null` (same gate failure) | `null` | `null` |

**Counterfactual (if `quantity` were passed — as unit tests do):**

| Product | Full input | Resolver output |
|---------|------------|-----------------|
| Paccheri | `{ name, quantity: 24, unit: null }` | **`un`** |
| Ginger Beer | `{ name, quantity: 24, unit: null }` | **`un`** |

Raw extract (edge): `quantity: 24`, `unit: null` for both (`.tmp/discount-binding-root-cause-output.json` stage_3).

### 5. Actual persistence path (if resolver did not run)

N/A — resolver runs. Persistence is client `runExtraction` → `insertRows` → `supabase.from("invoice_items").insert`. No alternate re-read branch, no edge insert, no post-resolver unit strip.

---

## Required stage table

| Stage | Paccheri | Ginger Beer |
|-------|----------|-------------|
| **Raw extract unit** | `null` | `null` |
| **Resolver called?** | YES | YES |
| **Resolver output** (actual `{name, unit}` call) | `null` | `null` |
| **Resolver output** (if `quantity` passed) | `un` | `un` |
| **DB payload unit** | `null` | `null` |
| **Persisted unit** | `null` | `null` |

---

## Live VL DB (read-only query 2026-06-23T10:32Z)

| Product | `invoice_item_id` | qty | unit | `created_at` |
|---------|-------------------|-----|------|--------------|
| De Cecco Paccheri Lisci 500g | `b06c61ac-d5d4-4aa5-92ca-7ce7918d0e2f` | 24 | **null** | 2026-06-23T10:28:12.641539Z |
| Baladin Ginger Beer 0.20cl | `4219f6f9-3d4f-4bc1-aad9-d65dbab16239` | 24 | **null** | 2026-06-23T10:28:12.641539Z |
| SanPellegrino 75cl x 15ud (control) | (same batch) | 2 | **un** | 2026-06-23T10:28:12.641539Z |

All 8 line items share identical `created_at` → delete/recreate batch. New row IDs vs prior audits (`8c4d16d6…` at 10:14Z, `cdecef89…` at 12:00Z audit) confirm **re-read executed again** while `unit` remains null.

---

## Git / deployment reconciliation

| Claim | Evidence |
|-------|----------|
| `local main = be21f02` | `git rev-parse main` → `be21f023653bd0252db147d22f6274fa79e9e014` |
| `origin/main = be21f02` | `git fetch origin main` → same SHA; `0 0` ahead/behind |
| Gate on `origin/main` | `shouldInferUnForEmbeddedMeasureCountable` present (2 matches) |
| Prior audit (10:20Z) | Said `origin/main` at `c23dcda` — **stale**; push landed since then |

**Conclusion:** Null units after re-read at **10:28Z** (post-push, post-`be21f02`) disprove “deployed code not active” as sole root cause. The fix is in git but **not wired at the call site**.

| Component | Runs resolver? | Notes |
|-----------|----------------|-------|
| Client `runExtraction` | **YES** | Passes `{ name, unit }` only |
| Edge `extract-invoice` v38 | **NO** | Returns raw `items[].unit` only |
| `.env.local` | Points to VL Supabase | Resolver runs in whichever bundle serves `/invoices` |

---

## Root cause — call-site wiring bug

```656:657:src/routes/invoices.tsx
const resolveInvoiceItemUnit = (item: Pick<ItemRow, "name" | "unit">) =>
  resolveInvoicePersistedItemUnit(item, isGenericUnit);
```

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
```

```1423:1439:src/lib/invoice-purchase-format.ts
function shouldInferUnForEmbeddedMeasureCountable(
  item: InvoiceLinePurchaseInput,
  resolution: InvoiceLinePurchaseUnitResolution,
): boolean {
  // ...
  const qty = item.quantity;
  if (qty == null || !Number.isFinite(qty) || !Number.isInteger(qty) || qty <= 1) return false;
```

**Gate diagnostics at persistence call site:**

| Gate | Paccheri | Ginger |
|------|----------|--------|
| `fallback_null` | PASS | PASS |
| OCR unit null | PASS | PASS |
| `weight_or_volume` | PASS | PASS |
| **`qtyPresent`** | **FAIL** | **FAIL** |
| **`qtyIntegerGt1`** | **FAIL** | **FAIL** |
| embedded retail g/cl | PASS | PASS |

Unit tests pass `quantity: 24` (`invoice-purchase-format.test.ts:815-840`) — tests do not cover the `{ name, unit }`-only persistence call shape.

**Pellegrino control:** persists `un` via `multi_unit_pack` / OCR `unit: un` — does not depend on the quantity gate.

---

## Final verdict

### **B) Resolver runs but returns null**

| Alternative | Ruled out by |
|-------------|--------------|
| A) Resolver never runs | `runExtraction:1448` always calls `resolveInvoiceItemUnit` before insert; re-read uses same path |
| C) Resolver returns `un` but persistence bypasses | `insertRows.unit` is direct resolver output; DB `null` matches resolver `null` |
| D) Other (deployment-only) | `origin/main = be21f02`; re-read at 10:28Z still null; replay with full line returns `un` |

---

## Evidence index

| Artifact | Role |
|----------|------|
| `.tmp/reread-persistence-path-audit/results.json` | Machine-readable full audit |
| `.tmp/reread-persistence-path-audit/audit.mts` | Read-only replay + VL query script |
| `.tmp/discount-binding-root-cause-output.json` | Paccheri extract `unit: null` stages 3–7 |
| `.tmp/post-deploy-persistence-verification/` | Superseded deployment hypothesis (origin now at be21f02) |
| `src/routes/invoices.tsx` | `reExtract`, `runExtraction`, resolver call site |
| `src/lib/invoice-purchase-format.ts` | `resolveInvoicePersistedItemUnit`, gate at :1423 |

**No code changes. No DB writes.**
