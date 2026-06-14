# Pepino Contamination Timeline Audit

**Mode:** READ-ONLY · **Generated:** 2026-06-14 · **Harness:** `run-timeline.mts`

---

## Executive Answer

**When was Pepino contamination created?**

**BEFORE human review** — on first Bidfood extract, **2026-06-09 ~22:36 UTC**, synchronously after `invoice_items` insert. No user confirm, no alias for bare "Pepino", no review-screen interaction.

| Question | Answer |
|----------|--------|
| Before human review? | **YES** (91%) |
| After human-confirmed action on Pepino line? | **NO** |
| First irreversible write | `ingredient_price_history` row `a689bd91` + `ingredients.current_price` |
| Root cause (single) | **B — Premature persistence** (combination E overall) |

---

## Facts

### Identifiers

| Entity | ID / value |
|--------|------------|
| Ingredient | `635a1189-36ea-4ff2-9012-8172ab1ab81d` — Pepino conserva |
| Bidfood invoice | `da472b7f-0fd9-4a26-a37c-80ad335f7f7e` |
| Pepino line | `8e9e727a-1d02-41f7-88e7-8eeea59c8b57` |
| Poisoned history | `a689bd91-5b83-41d9-b060-b5a63ccfb3b4` |

### Wall-clock timestamps (Supabase)

| Event | Timestamp |
|-------|-----------|
| Ingredient created | 2026-06-07T23:42:42Z |
| Jar aliases (6×, human) | 2026-06-07 → 2026-06-09 |
| **Bidfood invoice uploaded** | **2026-06-09T22:36:41Z** |
| Bidfood Pepino item (latest re-extract) | 2026-06-13T21:50:38Z |
| Ingredient updated_at | 2026-06-13T21:54:23Z |

### Stored history timestamps (invoice-date anchored)

| Row | Invoice date | new_price |
|-----|--------------|-----------|
| d723199d (April jar) | 2026-04-17 | 3.665 |
| 5bd9a4e1 (May jar) | 2026-05-19 | 3.748 |
| **a689bd91 (Bidfood Pepino)** | **2026-05-25** | **0.00177** |

`ingredient_price_history.created_at` uses invoice issue date (`T12:00:00Z`), not upload time — see `resolveIngredientPriceHistoryCreatedAt`.

---

## Chronological Trace (Steps 1–10)

### 1. Invoice uploaded
- **When:** 2026-06-09T22:36:41Z
- **Written:** `invoices` row, Bidfood Portugal, invoice_date 2026-05-25

### 2. OCR extraction
- **When:** Same session, synchronous
- **Changed:** Parsed line `{ Pepino, 3.36 kg, €1.77/kg }`
- **Code:** `invoices.tsx` extract stages 7–8

### 3. Invoice item created
- **When:** Immediately after extraction
- **Written:** `invoice_items` (no `ingredient_id` column)
- **Code:** `invoices.tsx` ~1307–1338 delete + insert

### 4. Matching decision
- **When:** In-process, before UI
- **Result:** `kind: exact`, `displayState: confirmed` → Pepino conserva
- **Alias lookup:** **MISS** for `pepino`
- **Matcher log:** similarity 0.88, canonicalIdentity 0.88, rejectionReason null

### 5. Alias lookup
- **6 jar aliases** exist (human-confirmed Jun 7–9)
- **No alias** for bare "Pepino"

### 6. Ingredient selection
- Virtual link to `635a1189` — **not persisted** on `invoice_items`

### 7. Price history write — **FIRST IRREVERSIBLE CONTAMINATION**
- **Row:** `a689bd91`, new_price `0.00177` (€/g operational)
- **Human action:** None
- **Code:** `appendIngredientPriceHistoryFromInvoiceLine`

### 8. Current price update
- **Same transaction** as step 7
- **Code:** `persistOperationalIngredientCostFromInvoiceLine`

### 9. Supplier intelligence impact
- Bidfood fresh line enters live purchase scan under Pepino conserva
- P0 guard blocks OI **output**; raw DB chain poisoned

### 10. Invoice review screen
- User sees **confirmed** match: "Matched to: Pepino conserva"
- Only **Correct match** (must pick another ingredient)
- **No Remove match**

---

## Observations

- Jar lines were **human-confirmed** (aliases `confirmed_by_user: true`) days before Bidfood upload.
- Pepino fresh line was **never** human-confirmed — no alias, no Confirm click.
- `displayState: confirmed` from `kind: exact` **skips** Confirm-match UI and **triggers** extract sync.
- Re-extract on 2026-06-13 recreated `invoice_items` but history row `a689bd91` persisted (refresh path preserves invoice-date `created_at`).
- `ingredients.current_price` now 21.99 (jar) — later re-extracts overwrote display price; **history chain still poisoned**.

---

## Calculations

- Operational price written: €1.77 / 1000g = **€0.00177/g** (`operational_fields_computed`)
- Cross-format delta (if chained to May jar 3.748): **≈ −99.95%**
- Days jar aliases existed before Bidfood upload: **~3 days** (Jun 7 → Jun 9)

---

## Critical Questions (YES/NO)

| # | Question | Answer |
|---|----------|--------|
| 1 | price_history written BEFORE review? | **YES** |
| 2 | current_price updated BEFORE review? | **YES** |
| 3 | Could user prevent with existing UI? | **NO** |
| 4 | Would "No Match" button prevent? | **NO** at review (already written); **YES** if gated before sync |
| 5 | Would Pending → Confirm prevent? | **YES** |
| 6 | First irreversible write? | `ingredient_price_history` + `ingredients.current_price` via extract sync |
| 7 | Root cause? | **E Combination** — primary **B Premature persistence** |

---

## Hypotheses

1. **Extract auto-sync is the contamination trigger** — matcher error alone is not persisted until cost sync runs.
2. **Exact promotion to confirmed bypasses review** — Confirm button only appears for `suggested`.
3. **Invoice-date anchoring obscures forensics** — wall-clock ordering requires `invoices.created_at` + `invoice_items.created_at`, not history `created_at`.

---

## What Must Be Fixed FIRST Before Pack Variants?

**Persistence workflow correction** (P0)

Pack Variants split catalog formats but do not stop pre-review cost writes to a shared `ingredient_id`. Pepino proves poison lands before any variant resolution.

### Ranked next work

1. **Persistence workflow correction** — gate extract sync, Remove match + history cleanup
2. **Matching improvements** — preservation-class / token-subset guards
3. **Pack Variants P1** — after 1+2 prevent wrong links

---

## Artifacts

| File | Contents |
|------|----------|
| `timeline.json` | Steps 1–10 with timestamps |
| `write-path-trace.json` | Code call stack |
| `persistence-trace.json` | DB writes per table |
| `ui-review-trace.json` | Review UI state + prevention |
| `root-cause.json` | Critical questions YES/NO |
| `recommendation.json` | Fix ordering before Pack Variants |
| `query-raw.json` | Raw Supabase + matcher output |
| `run-timeline.mts` | Read-only harness |

---

## Prior audit cross-references

- [remove-match-investigation](../remove-match-investigation/REPORT.md) — extract auto-sync, no remove match
- [identity-contamination-audit](../identity-contamination-audit/REPORT.md) — Pepino unit_family_mismatch
- [historical-pricing-integrity-audit](../historical-pricing-integrity-audit/REPORT.md) — trusted Bidfood Pepino history row (math valid, identity invalid)
- [post-p0-foundation-audit](../post-p0-foundation-audit/REPORT.md) — foundation MOSTLY CLOSED, identity work continues
