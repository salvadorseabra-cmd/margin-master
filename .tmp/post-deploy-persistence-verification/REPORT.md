# Post-Deploy Persistence Verification

**Validation Lab:** `bjhnlrgodcqoyzddbpbd`  
**Mode:** STRICT READ-ONLY — no code changes, no DB writes, no deployments, no fixes  
**Audited:** 2026-06-23  
**Invoice:** Emporio Italia `ab52796d-de1d-418d-86e7-230c8f056f09`

---

## Executive answer

Paccheri and Ginger Beer still render **"24"** because **`invoice_items.unit` is `null` in VL after re-read**, and the UI correctly omits the unit suffix when `unit` is empty.

**Re-read did execute** (delete + recreate at `2026-06-23T10:14:08Z`, new row IDs). **The embedded-measure `un` inference fix did not run on that re-read** because it lives in the **client-side frontend bundle** (`resolveInvoicePersistedItemUnit`), and the fix commit `be21f02` is **local only** — `origin/main` (proxy for deployed frontend) does **not** contain `shouldInferUnForEmbeddedMeasureCountable`. Deploying `extract-invoice` v38 at `10:13:38 UTC` does not affect unit persistence.

**Root cause:** **B) Deployed code not active** (client frontend bundle, not edge function).

---

## TASK 1 — Live DB state

Queried `invoice_items` read-only at `2026-06-23T10:20:41Z`.

| Product | invoice_item_id | qty | unit | created_at | updated_at |
|---------|-----------------|-----|------|------------|------------|
| De Cecco Paccheri Lisci 500g | `8c4d16d6-89c6-4fd0-8d3a-d18a6e65666a` | 24 | **null** | 2026-06-23T10:14:08.313145Z | 2026-06-23T10:14:08.313145Z |
| Baladin Ginger Beer 0.20cl | `f187d028-9a8f-400a-aead-80b7f5f98de1` | 24 | **null** | 2026-06-23T10:14:08.313145Z | 2026-06-23T10:14:08.313145Z |
| SanPellegrino 75cl x 15ud (control) | `3236684f-1c48-4ed9-ba4c-e7b83b774fba` | 2 | **un** | 2026-06-23T10:14:08.313145Z | 2026-06-23T10:14:08.313145Z |

All 8 Emporio line items share identical `created_at` / `updated_at` → single batch insert.

---

## TASK 2 — Re-read effect

**Verdict: B) delete/recreate**

| Evidence | Value |
|----------|-------|
| Prior Paccheri ID (2026-06-20) | `728517aa-8578-4f6f-a415-aae06f05f5c4` |
| Prior Paccheri ID (mid-day audit) | `cdecef89-2881-4795-92ba-93c06bc7c8e8` |
| **Current Paccheri ID** | `8c4d16d6-89c6-4fd0-8d3a-d18a6e65666a` |
| Prior Ginger ID (2026-06-20) | `634a418b-1509-42a9-bf01-563705967b6f` |
| **Current Ginger ID** | `f187d028-9a8f-400a-aead-80b7f5f98de1` |
| Re-read batch timestamp | `2026-06-23T10:14:08.313145Z` |
| Unit after re-read | **still null** (Paccheri, Ginger) |

Not A) — re-read clearly ran (new IDs, uniform timestamp).  
Not C) — rows were replaced, not left untouched.

---

## TASK 3 — Execution trace

Pipeline: `reExtract` → `runExtraction` → `extract-invoice` (edge) → client normalize → `resolveInvoicePersistedItemUnit` → delete + insert.

| Stage | Paccheri | Ginger Beer |
|-------|----------|-------------|
| **Extraction unit** (GPT / edge) | `null` | `null` |
| **Structured kind** | `weight_or_volume` | `weight_or_volume` |
| **Resolver input** | `{ name: "…500g", qty: 24, unit: null }` | `{ name: "…0.20cl", qty: 24, unit: null }` |
| **Resolver output** | `{ unit: null, source: "fallback_null" }` | `{ unit: null, source: "fallback_null" }` |
| **Persistence payload** (deployed proxy) | `null` | `null` |
| **Persistence payload** (current local code) | **`un`** | **`un`** |
| **Persisted DB unit** | **`null`** | **`null`** |

**Observed mismatch:** deployed-proxy payload = DB = `null`. Current local code would have inserted `un`. Pellegrino control persisted `un` via existing `multi_unit_pack` path (no new gate needed).

Code path confirmed:

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

`resolveInvoiceItemUnit` → `resolveInvoicePersistedItemUnit` in `invoice-purchase-format.ts` (client only).

---

## TASK 4 — Deployment validation

### `shouldInferUnForEmbeddedMeasureCountable` present?

| Location | Present? | Evidence |
|----------|----------|----------|
| **Local workspace** | **YES** | `src/lib/invoice-purchase-format.ts:1423` |
| **Commit** | `be21f023653bd0252db147d22f6274fa79e9e014` | 2026-06-23 11:13:32 +0100 — "Fix embedded-measure countable unit inference" |
| **origin/main (deployed frontend proxy)** | **NO** | 0 matches; last touch `c23dcda` (2026-06-10) |
| **local main ahead of origin** | **19 commits** | `be21f02` not pushed |

### Where inference runs

| Component | Runs `resolveInvoicePersistedItemUnit`? |
|-----------|----------------------------------------|
| Client `invoices.tsx` `runExtraction` | **YES** — on every upload and re-read |
| Edge `extract-invoice` v38 | **NO** — returns raw `items[].unit` only |

### Edge function (for completeness)

| Function | Version | Updated (UTC) | Relevance to unit fix |
|----------|---------|---------------|----------------------|
| `extract-invoice` | 38 | 2026-06-23 10:13:38 | **None** — deployed 30s before re-read, but extraction already returns `unit: null` for both rows; client resolver decides persisted unit |

**Timeline alignment:**

| Event | Timestamp (UTC) |
|-------|-----------------|
| Local commit `be21f02` | ~10:13:32 |
| Edge `extract-invoice` v38 deploy | 10:13:38 |
| Emporio re-read (DB `created_at`) | **10:14:08** |
| Paccheri/Ginger `unit` after re-read | **null** |

Re-read ran **after** edge deploy but **without** client fix in the active frontend bundle.

---

## TASK 5 — Gate validation

All six gates **PASS** for both rows under **current local code**:

| Gate | Paccheri | Ginger Beer |
|------|----------|-------------|
| OCR unit null | PASS | PASS |
| `weight_or_volume` | PASS | PASS |
| Integer qty > 1 | PASS | PASS |
| Embedded retail g/cl in name | PASS | PASS |
| No pack markers (EMB/CX/CAIXA/PACK) | PASS | PASS |
| `fallback_null` from resolver | PASS | PASS |

| Question | Paccheri | Ginger Beer |
|----------|----------|-------------|
| Would **current local code** infer `un`? | **YES** | **YES** |
| Would **deployed origin/main** infer `un`? | **NO** | **NO** |

---

## TASK 6 — Root cause (exactly one)

### **B) Deployed code not active**

The re-read executed the full client persistence path with the **pre-fix** `resolveInvoicePersistedItemUnit` (no `shouldInferUnForEmbeddedMeasureCountable`). Extraction returned `unit: null`; old resolver returned `fallback_null` → insert `null`. DB write succeeded (Pellegrino `un` proves insert path works).

| Alternative | Ruled out by |
|-------------|--------------|
| A) Re-read never executed new logic | Re-read **did** execute; wrong logic version was active |
| C) Different persistence path bypasses resolver | `runExtraction` always calls `resolveInvoiceItemUnit` before insert |
| D) Resolver ran but DB write failed | Rows inserted; `unit: null` is explicit insert value |
| E) UI issue | DB `unit` is `null`; UI `formatRowPurchaseQuantityLabel` omits suffix correctly |
| F) Other | — |

---

## TASK 7 — Hypothetical fresh upload today

Assuming extraction returns `qty: 24, unit: null` (confirmed on ab52796d path):

| Product | Deployed frontend (origin/main) | Current local code (be21f02) |
|---------|--------------------------------|------------------------------|
| Paccheri 500g | **`null`** persists → UI **"24"** | **`un`** persists → UI **"24 un"** |
| Ginger Beer 0.20cl | **`null`** persists → UI **"24"** | **`un`** persists → UI **"24 un"** |

---

## Why UI shows "24" not "24 un"

`invoice_items.unit = null` → `formatRowPurchaseQuantityLabel({ quantity: 24, unit: null })` → `"24"`.  
Pellegrino shows `"2 un · 15 × 75 cl"` because `unit = "un"` **and** `multi_unit_pack` structured format.

---

## Evidence index

| Artifact | Role |
|----------|------|
| `.tmp/post-deploy-persistence-verification/results.json` | Machine-readable full audit |
| `.tmp/post-deploy-persistence-verification/verify.mts` | Read-only replay script |
| `.tmp/embedded-measure-un-inference-validation/` | Pre-deploy local replay (null→un with fix) |
| `.tmp/paccheri-ginger-representation-source-audit/` | UI formatter trace (assumed fix active — superseded by this audit) |
| `.tmp/invoice-unit-persistence-audit/` | Historical extraction→insert pipeline |
| VL live query 2026-06-23 | Confirms post-re-read `unit=null` |
| `git origin/main` vs `HEAD` | Fix not on deployed frontend proxy |

---

## Required action (informational only — no changes made)

Push/deploy frontend bundle containing `be21f02`, then re-read Emporio `ab52796d`. Expected result: Paccheri and Ginger `invoice_items.unit = 'un'` → UI **"24 un"**.

**No code changes. No DB writes. No deployments.**
