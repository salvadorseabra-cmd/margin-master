# Final Verdict — Re-Read Determinism Investigation

**Generated:** 2026-06-14  
**Mode:** READ-ONLY investigation  
**Investigator:** subagent `c1437709-95a1-43be-8126-f0e25f896268`  
**Live queries:** 2026-06-14T15:45–15:46Z

---

## Questions

| Question | Answer |
|----------|--------|
| **Should re-read be deterministic end-to-end?** | **NO** |
| **Is current behavior expected?** | **YES** |
| **Bug?** | **NO** |
| **Most likely root cause** | **A — OCR variability** (primary); **E — query/load timing** and **C — lifecycle persistence** (contributing) |
| **Race condition?** | **NO** |

---

## Executive Summary

Repeated re-reads of the same invoice produce different match results because:

1. **Re-read re-invokes non-deterministic OCR** — Anchovas brand token changes every re-read (`Alconfi sta` → `Alconfrisa` → `Alconfirsta`), toggling exact-key alias hit/miss.
2. **Re-read resets lifecycle rows** — DELETE items CASCADE deletes matches; shadow seed creates fresh rows with no T8 preserve policy.
3. **UI reads virtual matcher while READ_CUTOVER is OFF** — Pepino shows `confirmed` (virtual `exact`) while persisted is `suggested`/`unmatched`, creating apparent flip when user actions occur between re-reads.

The matcher itself **is deterministic** given fixed OCR text + DB snapshot. End-to-end re-read is **not** deterministic.

---

## Root Cause Classification

| Code | Label | Applies? | Evidence |
|------|-------|----------|----------|
| **A** | OCR variability | ✅ **PRIMARY** | Anchovas brand token changes every re-read; alias exact-key miss/hit; `.tmp/vl-ocr-rc/ocr-stability-runs.json` |
| **B** | Matcher variability | ❌ | Same OCR + same alias map → same result (`validate-anchoas-reread.mts matcher`) |
| **C** | Lifecycle persistence | ⚠️ Contributing | CASCADE wipe + re-seed; no T8 preserve; DB evolves (aliases/overrides added mid-session) |
| **D** | Race condition | ❌ | Extract path fully awaited; shadow seed not fire-and-forget on extract |
| **E** | Query/load timing | ⚠️ Contributing | `READ_CUTOVER=OFF` → UI shows virtual `confirmed` for Pepino while persisted is `suggested`/`unmatched` |
| **F** | Other | ⚠️ Minor | Reject pairs (localStorage); user unmatch/confirm between re-reads |

---

## Evidence Highlights

### 1. OCR Instability

`.tmp/vl-ocr-rc/ocr-stability-runs.json` — Anchovas brand variants include `Alconfirosa`, `Alconfi osa`, `Alcofiorisa`, and 20+ others.

### 2. Three Anchovas Re-Reads, Three Outcomes

`.tmp/anchoas-reread-investigation/REREAD_COMPARISON.md` + live query:

| Re-read | Item ID | OCR | Result |
|---------|---------|-----|--------|
| #1 | `6f416cf6…` | `Alconfirsta` | unmatched |
| #2 | `69d22f75…` | `Alconfi sta` | unmatched |
| #3 | `4c54f26b…` | `Alconfrisa` | confirmed |

### 3. Pepino Virtual/Persisted Split

`.tmp/match-lifecycle-phase4a-validation/PEPINO_DIFF.md` — virtual `confirmed` vs persisted `suggested`, same `ingredient_id`.

### 4. Persisted Status Mapping

Only alias/override kinds → `confirmed` in persisted layer:

```98:114:src/lib/invoice-item-match-helpers.ts
const PERSISTED_CONFIRMED_MATCH_KINDS = new Set<string>([
  "confirmed-alias",
  "confirmed-override",
]);
// ...
export function resolvePersistedMatchStatusFromMatcher(
  match: IngredientCanonicalMatch | null | undefined,
): InvoiceItemMatchStatus {
  if (!match) return "unmatched";
  if (PERSISTED_CONFIRMED_MATCH_KINDS.has(match.kind)) return "confirmed";
  if (match.ingredient?.id?.trim()) return "suggested";
  return "unmatched";
}
```

### 5. Virtual Treats Bare `exact` as Confirmed

```26:35:src/lib/ingredient-match-explanation.ts
export function isConfirmedIngredientMatch(
  match: Pick<IngredientCanonicalMatch, "kind"> | null | undefined,
): boolean {
  return (
    match?.kind === "exact" ||
    match?.kind === "confirmed-override" ||
    match?.kind === "confirmed-alias" ||
    // ...
  );
}
```

### 6. Lifecycle Coverage Clean

`.tmp/pepino-live-validation/baseline.json` — 51/51 items matched, 0 orphans, 0 duplicates.

### 7. Current VL Flags

| Flag | Value |
|------|-------|
| `SHADOW_SEED` | `true` |
| `DUAL_WRITE` | `true` |
| `READ_CUTOVER` | **`false`** |

---

## What Is NOT a Bug

- Matcher logic — deterministic per input
- Shadow seed — awaited, deterministic per OCR + DB
- CASCADE delete — intentional design
- Virtual/persisted split — documented intentional drift
- Dual write fire-and-forget — only on user actions, not extract

---

## Recommended Next Steps (Guidance Only)

1. **Do not expect bit-identical re-read results** until OCR is stabilized or fuzzy brand-token normalization is added.
2. **Enable `READ_CUTOVER`** when testing lifecycle persistence — eliminates Pepino-class virtual/persisted confusion.
3. **Implement T8 preserve policy** if re-read should carry forward prior user confirmations.
4. **Add OCR canonicalization** for supplier brand tokens before alias lookup (addresses Anchovas specifically).

---

## Deliverable Index

| File | Contents |
|------|----------|
| `PIPELINE_TRACE.md` | Re-read execution order from `invoices.tsx` through shadow seed and UI load |
| `INVOICE_ITEM_AUDIT.md` | Last 3 re-reads — item IDs, OCR text, match state |
| `MATCH_LIFECYCLE_AUDIT.md` | CASCADE reset, shadow seed, T8 preserve gap |
| `RACE_CONDITION_AUDIT.md` | Async ops audit — no race on extract path |
| `ANCHOAS_PEPINO_COMPARISON.md` | Why opposite flip pattern occurs |
| `FINAL_VERDICT.md` | This document |

Optional validation script: `scripts/validate-reread-determinism.mts`

---

## Cross-References

- `.tmp/anchoas-reread-investigation/` — prior Anchovas re-read investigation
- `.tmp/pepino-live-validation/` — Pepino lifecycle live validation
- `.tmp/match-lifecycle-phase4a-validation/` — virtual vs persisted drift (PEPINO_DIFF.md)
- `.tmp/vl-ocr-rc/ocr-stability-runs.json` — OCR stability evidence
