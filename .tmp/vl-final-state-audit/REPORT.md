# Validation Lab Final State Audit

**Deploy verified:** extract-invoice **v31** on `bjhnlrgodcqoyzddbpbd`  
**Generated:** 2026-06-13  
**Mode:** READ-ONLY — v31 re-extract vs live Supabase DB; no writes

---

## VL Final Status: **PARTIAL** (81% confidence)

| Layer | Status | Summary |
|-------|--------|---------|
| **Extraction quality** | MOSTLY CLOSED | v31 deployed; structural bugs fixed v28–v31; Farina 95% stable (20-run) |
| **Operational / DB integrity** | PARTIAL | 5/6 invoices stale vs v31; **Emporio CRITICAL (0 rows)** |
| **Re-read safety** | CLOSED | No duplicates; empty-wipe guard validated; Emporio wipe predates fix |
| **Combined** | **PARTIAL** | Extraction ready; DB sync required before operational intelligence is trustworthy |

---

## Critical Finding: Emporio Wiped

**Emporio Italia** (`17aa3591-ec98-4c21-89c9-5ae946bc97bb`) has **0 `invoice_items` rows** in DB.

- v31 extract this audit: **8 rows**, €327.46 header — extraction works
- DB: **empty** — invoice appears blank in Marginly app
- **Likely cause:** prior empty-extraction DELETE before June 12 reread-safety guard; never repopulated
- **Action:** **URGENT re-read** in UI

---

## Integrity Matrix

| Check | Result | Detail |
|-------|--------|--------|
| Invoice items count | **FAIL** | Emporio 0 vs 8; others 5/5 match |
| Duplicate purchases | **PASS** | 0 duplicate name groups; mutex prevents same-session double-insert |
| Ghost purchases | **PASS** | No orphan `invoice_items`; no items without parent invoice |
| Stale rows | **FAIL** | 5/6 invoices DB ≠ v31 (persisted ~2026-06-11, pre-v31) |
| Ingredient matching | **NOT VERIFIED** | Simplified audit matcher; live matcher in `invoices.tsx` is authoritative |
| Historical pricing | **STALE** | Bidfood Pepino (€0.00177 scaling), Aviludo price_history from old runs |
| Dashboard totals | **EXPECTED** | Header ≠ line sum is normal (IVA in header, net lines) |
| Opportunities | **STALE RISK** | Margin alerts derive from `ingredient_price_history` tied to old unit_prices |
| Supplier intelligence | **STALE** | Recomputes from `invoice_items` scan — empty/wrong DB → wrong signals |

---

## Per-Invoice Operational Status

| Invoice | Status | DB | v31 | Key issue |
|---------|--------|----|-----|-----------|
| Bidfood | STALE | 11 | 11 | 1 row drift; Pepino price_history scaling |
| Aviludo April | STALE | 9 | 9 | DB from prior run; **this audit v31 invoke BAD** (€68 totals) |
| Aviludo May | STALE | 8 | 8 | 1 row drift; 2 stale price_history |
| Bocconcino | STALE | 7 | 7 | unit_price display drift; totals mostly OK |
| **Emporio** | **CRITICAL** | **0** | **8** | **All rows deleted — empty invoice** |
| Mammafiore | STALE | 8 | 8 | Farina DB **€26.52 correct**; v31 this run €25.52 (variance) |

---

## Extraction vs Operational (Separated)

### Extraction (already audited — CLOSED)

- v31 deployed and verified
- Farina: 19/20 at €26.52 ([farina-stability-final](.tmp/farina-stability-final/))
- Structural families closed: Rulo IVA, Mortadella Desc., Emporio cluster, April harness
- Remaining: Gorgonzola GPT variance, Farina 5% digit drift, Pomodor GT catalog

### Operational (this audit — PARTIAL)

- **Root cause of stale DB:** VL invoices uploaded/re-read once (~June 11) and not re-synced after v29–v31 deploys
- **Persistence path is faithful:** `normalizeInvoiceItemFields` → DELETE → INSERT preserves numerics ([persistence-audit](.tmp/persistence-audit/REPORT.md))
- **No active corruption:** drift is stale snapshot, not pipeline bug
- **Re-read safety fix** (June 12) prevents future empty wipes and same-session duplicates

---

## Notable Row-Level Findings

### Mammafiore Farina

| Source | unit_price | total |
|--------|------------|-------|
| DB (2026-06-11) | 33.154 (list) | **26.52** ✓ |
| v31 this audit | 26.52 (net derived) | 25.52 ✗ |
| Farina 20-run stability | 26.52 | 26.52 (95%) |

DB actually holds the **correct** Farina total; this single audit invoke hit GPT variance.

### Bocconcino POMODOR

Per [persistence-audit](.tmp/persistence-audit/REPORT.md), DB may still hold stale qty=6/€120 from older extraction. v31 returns visible-correct qty=1/€22.05. Re-read will fix.

### Aviludo April — Audit Invoke Warning

This audit's v31 invoke returned column-shift errors (line `total` = `unit_price` for multi-qty rows, header €68 vs €370). **Do not treat as regression** — single bad GPT run. DB holds prior correct 9-row extraction. Re-read only when probe stable.

---

## Dashboard & Intelligence Impact

| System | Impact when DB stale |
|--------|----------------------|
| Invoice list totals | Emporio shows €0 lines; others show old unit_prices |
| Ingredient price history | Stale `new_price` on matched lines (Bidfood, Aviludo) |
| Margin alerts / opportunities | Inflation signals from old prices |
| Supplier watch | Under-counted if Emporio empty |
| Recipe cost impact | Uses `ingredient_price_history` — stale until re-read + cost sync |

**Header vs line-sum "mismatches"** (e.g. Mammafiore €415.96 header vs €374.94 lines) are **expected** — header includes IVA; not a dashboard bug.

---

## Re-read Safety Validation

From [reread-safety-fix-validation](.tmp/reread-safety-fix-validation/):

| Scenario | Status |
|----------|--------|
| Empty extraction → no DELETE | ✅ Validated |
| Concurrent re-read mutex | ✅ Same session |
| Delete error → abort insert | ✅ Validated |
| Insert error → surfaced | ✅ Validated |
| Cross-tab race | ⚠️ Low risk remains |

**No duplicate purchases found** in DB — Emporio duplication issue from prior audit is not present.

---

## Recommendations

1. **URGENT:** Re-read **Emporio** (0 rows)
2. Re-read **Bidfood, Bocconcino, Mammafiore, Aviludo May** to sync v31
3. **Defer Aviludo April** re-read until v31 invoke stable (bad run this audit)
4. Revise **Pomodor GT** in catalog (extraction Class C)
5. **Pause VL extraction work**; operational DB sync is the remaining gate
6. Resume **Core Marginly roadmap** after re-read batch

---

## Artifacts

| File | Contents |
|------|----------|
| `final-state.json` | Structured findings + refined verdict |
| `per-invoice/*.json` | Per-invoice checks (raw harness output) |
| `extracts/*.json` | Fresh v31 extraction payloads |
| `run-audit.mts` | Audit harness (re-runnable) |

**Evidence baselines:** `.tmp/final-validation-lab-rerun-v30/`, `.tmp/validation-lab-closure-audit/`, `.tmp/farina-stability-final/`, `.tmp/reread-safety-fix-validation/`, `.tmp/persistence-audit/`
