# Re-read Safety Audit — Design Report

Generated: 2026-06-12  
Workspace: `/Users/salvadorseabra1/margin-master`  
Mode: **READ-ONLY** (design only — no implementation)

---

## Executive Summary

Re-read data loss and duplication are **client-side persistence bugs** in `runExtraction`, not `extract-invoice` extraction logic. The edge function returns results; the frontend **unconditionally deletes** all `invoice_items` then **conditionally inserts** only when `items.length > 0`.

| Failure | Mechanism | Observed |
|---------|-----------|----------|
| **Empty wipe** | DELETE → skip INSERT on `items:[]` | Aviludo April 9→0 |
| **Duplicate rows** | Concurrent DELETE/INSERT race | Emporio 8→16 |
| **Insert failure wipe** | DELETE then INSERT throws | Theoretical; same code path |

**Smallest safe fix:** Frontend guard in `runExtraction` — **never DELETE unless `normalizedItems.length > 0`** + **synchronous in-flight mutex** per `invoiceId`.

**Fix belongs:** **Frontend** (`src/routes/invoices.tsx`)  
**Confidence:** **92%**  
**Regression risk:** **LOW**

---

## 1. Current `runExtraction` Flow

```
reExtract(row)                          uploadOne(file) [new invoice]
    │                                        │
    └──────────────► runExtraction(invoiceId, dataUrl)
                           │
                    setExtracting(true)
                           │
                    invoke extract-invoice
                           │
                    ❌ DELETE all items     ← unconditional (line 1263)
                           │
                    normalize + filter
                           │
                    IF items.length && user
                       INSERT rows
                    ELSE skip (log only)    ← empty → wipe with no insert
                           │
                    return { itemsCount }   ← success even when 0 items
                           │
                    finally: setExtracting(false)
```

**Backend:** `extract-invoice/index.ts` does **not** write to `invoice_items` (handoff note at line 204).

---

## 2. Delete / Insert Timing

| Step | Line | When | Checked? |
|------|------|------|----------|
| Extract API | 1236 | Always | `error` thrown |
| **DELETE** | **1263** | **Always after extract** | **No** |
| Normalize/filter | 1264-1266 | After delete | — |
| **INSERT** | 1302 | Only if `items.length && user` | Yes |
| Cost sync | 1315+ | After insert | — |

**Bug:** Delete happens **before** the `items.length` guard. Empty array passes HTTP 200 and triggers wipe.

---

## 3. Empty Extraction Handling

```1262:1347:src/routes/invoices.tsx
// wipe prior items then insert fresh
await supabase.from("invoice_items").delete().eq("invoice_id", invoiceId);
// ...
if (items.length && user) {
  // INSERT ...
} else {
  console.log("[invoice-ocr] stage=9 persistence-skipped", {
    reason: !items.length ? "no items from extraction" : "no user session",
  });
}
```

- `reExtract` treats `result` as success when `itemsCount: 0` (not `null`)
- Invoice metadata still updates; UI refreshes to **0 rows**
- **No toast / error** shown to user

**Aviludo evidence:** `.tmp/aviludo-reread-audit/` — 9 rows deleted, 0 inserted, HTTP 200.

---

## 4. Failure Handling

| Scenario | DELETE runs? | INSERT runs? | User sees |
|----------|--------------|--------------|-----------|
| API error (throw) | No | No | Spinner stops; items unchanged |
| HTTP 200, `items:[]` | **Yes** | No | **Items vanish** |
| HTTP 200, all rows filtered | **Yes** | No | **Items vanish** |
| DELETE ok, INSERT throws | Yes | Failed | **Items vanish**; catch → `null` |
| Partial rows (3 of 9) | Yes | 3 rows | 9→3 replace (by design) |

`reExtract` only updates header when `result` is truthy — empty success object is truthy.

---

## 5. Concurrent Re-read Handling

| Guard | Present? | Effective? |
|-------|----------|------------|
| `disabled={!!extracting[r.id]}` | Yes (UI) | Partial |
| `runExtraction` entry check | **No** | — |
| Sync ref mutex | **No** | — |
| DB transaction | **No** | — |
| Unique constraint | **No** | — |

**Race window:** Two `reExtract` calls can enter before `setExtracting` propagates. List wand + expanded Re-read are **two entry points** to the same function.

**Emporio evidence:** Two insert batches 9ms apart, 8+8=16 rows (`.tmp/emporio-duplicate-audit/`).

---

## 6. Double-click Handling

- Button disabled while `extracting[id]` — React state update is **async**
- `runExtraction` sets extracting at line 1230 but **does not reject** duplicate calls
- Fast double-click or parallel triggers → overlapping DELETE/INSERT

---

## 7. Partial Extraction Handling

When extraction returns fewer rows than stored:
- Full replace semantics apply (DELETE all, INSERT new set)
- Not a persistence bug; product may want threshold warning (phase 2)
- Distinct from **empty** wipe where new set is zero

---

## Exact Failure Mechanism

**Primary:** `DELETE` at line 1263 is unconditional after successful API response. `INSERT` gated on `items.length > 0`. Zero-item success response → **destructive wipe**.

**Secondary:** Delete-then-insert is not atomic and has no in-flight lock → concurrent runs produce duplicate batches.

---

## Smallest Safe Fix (Design)

### A. Replace-only-when-ready (required)

1. Normalize/filter **before** DELETE
2. If `normalizedItems.length === 0` → skip DELETE and INSERT; return `persistenceSkipped: true`
3. Check DELETE error before INSERT

### B. In-flight mutex (required)

1. `extractionInFlightRef` checked synchronously at `runExtraction` entry
2. Return early if same `invoiceId` already extracting

### C. User feedback (recommended)

1. Toast when re-read returns 0 accepted rows but prior items existed
2. Do not imply success in UI refresh

**~15–25 LOC** in `src/routes/invoices.tsx`. No schema/backend change.

---

## Fix: Frontend or Backend?

| Layer | Verdict |
|-------|---------|
| **Frontend** | **YES — primary** All persistence is here |
| Backend | Optional phase 2 (transactional RPC) |
| extract-invoice | No change needed for safety guard |

---

## Could Existing Invoices Be Corrupted Today?

**Yes.**

| Manifestation | Example | Detectable |
|---------------|---------|------------|
| Zero items after re-read | Aviludo `c2f52357` 9→0 | `invoice_items` count = 0, total ≠ 0 |
| Duplicate rows | Emporio `17aa3591` 8→16 | Duplicate names, twin `created_at` clusters |
| Under-extraction replace | Any re-read | Row count drop without user intent |

Stale DB (old extraction never re-run) is **not** corruption — different issue per `.tmp/persistence-audit/`.

---

## Regression Risk

| Risk | Level |
|------|-------|
| Preserve rows on empty re-read | None — desired |
| Block concurrent duplicate insert | None — desired |
| First-upload empty extract | None — same as today |
| Partial replace behavior | Unchanged — medium product risk |
| Cross-tab double re-read | Low — needs phase 2 DB lock |

**Overall: LOW**

---

## Artifacts

| File | Contents |
|------|----------|
| `risk-matrix.json` | Failure modes, severity, guards |
| `recommended-fix.json` | Preferred fix, confidence, files, regression |
| `REPORT.md` | This report |

---

## Return Summary

| Field | Value |
|-------|-------|
| Exact failure mechanism | Unconditional DELETE + conditional INSERT on zero-item success |
| Smallest safe fix | Normalize first; DELETE only if `normalizedItems.length > 0`; ref mutex |
| Regression risk | LOW |
| Fix belongs | **Frontend** |
| Corrupted today? | **Yes** (empty wipe, duplicate race) |
| Confidence | **92%** |
