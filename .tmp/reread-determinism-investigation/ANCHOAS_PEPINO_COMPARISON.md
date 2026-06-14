# Anchovas vs Pepino Comparison — Re-Read Determinism Investigation

**Generated:** 2026-06-14  
**Mode:** READ-ONLY investigation  
**Related audits:** `.tmp/anchoas-reread-investigation/`, `.tmp/pepino-live-validation/`, `.tmp/match-lifecycle-phase4a-validation/PEPINO_DIFF.md`, `.tmp/vl-ocr-rc/ocr-stability-runs.json`

---

## Problem Pattern

Repeated re-reads of the same invoices produce opposite flip behavior:

| Re-read | Anchovas (Aviludo) | Pepino (Bidfood) |
|---------|-------------------|------------------|
| **A** | unmatched | matched |
| **B** | matched | unmatched |
| **C** | matched | unmatched |

Why does one flip while the other does the opposite?

---

## Side-by-Side Comparison

| Factor | Anchovas (Aviludo) | Pepino (Bidfood) |
|--------|--------------------|------------------|
| **Invoice ID** | `c2f52357-0f80-491a-ba14-c97ff4837472` | `da472b7f-0fd9-4a26-a37c-80ad335f7f7e` |
| **Ingredient ID** | `c811f67f-df4d-4194-ba8b-7a15d4af38bd` | `635a1189-36ea-4ff2-9012-8172ab1ab81d` (conserva) |
| **OCR stability** | Highly unstable brand token (20+ variants) | Stable line text `"Pepino"` |
| **Match path** | Exact-key **alias** (`confirmed-alias`) | Bare **`exact`** name match |
| **Alias coverage** | 10 confirmed aliases; hit/miss depends on exact OCR spelling | No Bidfood alias for bare `"Pepino"` |
| **Persisted status on seed** | `confirmed` if alias hit; else `unmatched` | Always `suggested` (exact ≠ confirmed in persisted layer) |
| **Virtual display (cutover OFF)** | Same as matcher | **`confirmed`** — intentional drift |
| **User actions between re-reads** | Manual confirm added `Alconfi sta` alias | Unmatch → reject pair; later confirm → Pepino fresco |
| **Semantic fallback** | Rejects Anchoas (~0.23 score) when alias misses | N/A — exact match fires |

---

## Opposite Flip Mechanism

```
Re-read A:
  OCR "Alconfi sta"  → alias MISS → Anchovas UNMATCHED
  Virtual Pepino exact → Pepino MATCHED (UI shows confirmed)

Re-read B:
  OCR "Alconfrisa"   → alias HIT  → Anchovas MATCHED
  Pepino unmatch/reject pair       → Pepino UNMATCHED (persisted + blocked virtual)

Re-read C:
  OCR "Alconfrisa"   → alias HIT  → Anchovas MATCHED (same as B)
  Pepino state depends on reject pair / reassignment → UNMATCHED or reassigned
```

**Anchovas is OCR-gated.** Pepino is **layer-gated** (virtual confirmed vs persisted suggested/unmatched, plus reject pairs in localStorage).

---

## Anchovas — OCR-Gated Matching

### OCR Instability

Documented in `.tmp/vl-ocr-rc/ocr-stability-runs.json`. Brand token variants include:

- `Alconfrisa`
- `Alconfi sta`
- `Alconfirsta`
- `Alconfirosa`
- `Alconfi osa`
- `Alcofiorisa`
- `Alconfilosa`
- … (20+ variants)

### Matcher Behavior (Deterministic per OCR)

Verified via `scripts/validate-anchoas-reread.mts matcher`:

| OCR variant | Alias hit | Match kind | displayState |
|-------------|-----------|------------|--------------|
| `Alconfrisa` | ✅ | `confirmed-alias` | `confirmed` |
| `Alconfi sta` | ❌ | null | `unmatched` |
| `Alconfirsta` | ❌ | null | `unmatched` |
| `Alconfilosa` | ❌ | null | `unmatched` |

Matcher is **deterministic** — same OCR + same alias map = same result. Variability is entirely in OCR output.

### Alias Exact-Key Requirement

Normalization pipeline (`normalizeInvoiceIngredientName`) does not collapse spaced brand variants:

- `Alconfrisa` → `filete de anchovas alconfrisa 495` → alias HIT
- `Alconfi sta` → `filete de anchovas alconfi sta 495` → alias MISS

See `.tmp/anchoas-reread-investigation/REREAD_COMPARISON.md`.

---

## Pepino — Layer-Gated Matching

### OCR Stability

Line text is always `"Pepino"`. OCR does not change across re-reads.

### Virtual vs Persisted Split

From `.tmp/match-lifecycle-phase4a-validation/PEPINO_DIFF.md`:

| Field | Virtual | Persisted |
|-------|---------|-----------|
| `displayState` / `status` | **confirmed** | **suggested** |
| `match.kind` / `match_kind` | exact | exact |
| `ingredient_id` | `635a1189…` (conserva) | `635a1189…` (conserva) |

**Intentional drift** — bare `exact` is confirmed in virtual layer but only `suggested` in persisted layer:

```typescript
// resolvePersistedMatchStatusFromMatcher — only alias/override → confirmed
const PERSISTED_CONFIRMED_MATCH_KINDS = new Set(["confirmed-alias", "confirmed-override"]);

// isConfirmedIngredientMatch — exact → confirmed in virtual
return match?.kind === "exact" || match?.kind === "confirmed-override" || ...
```

With `READ_CUTOVER=false`, UI shows virtual `confirmed` → Pepino appears **matched** even when persisted is `suggested`.

### User Actions Drive Flip

From `.tmp/pepino-live-validation/`:

1. Re-read #1: shadow seed → `suggested`; UI shows `confirmed` (virtual)
2. User unmatch (14:17): persisted → `unmatched`, reject pair stored
3. Re-read #2: new item UUID, seed may re-match but reject pair blocks virtual display
4. User confirm → Pepino fresco: reassignment to different ingredient

Pepino flip is driven by **user lifecycle actions + display layer**, not OCR.

---

## Why They Flip in Opposite Directions

| | Anchovas | Pepino |
|---|----------|--------|
| **Primary driver** | OCR text changes | Display layer + user actions |
| **Re-read A unmatched because** | OCR miss (`Alconfi sta`) | N/A — Pepino matched in A |
| **Re-read B matched/unmatched because** | OCR hit (`Alconfrisa`) | User unmatch + reject pair |
| **Deterministic if…** | OCR stabilized | READ_CUTOVER enabled + no user actions |

The **opposite pattern** is an artifact of two independent mechanisms:

1. Anchovas: non-deterministic OCR → alias hit/miss toggles
2. Pepino: stable OCR + virtual/persisted split + user unmatch → appears unmatched when Anchovas finally hits

---

## Matcher Variability Check

**Classification B (Matcher variability): ❌**

Same OCR text + same alias map + same catalog → identical matcher output every time. Verified by:

- `scripts/validate-anchoas-reread.mts matcher` — deterministic per variant
- `.tmp/anchoas-reread-investigation/MATCHER_TRACE.md`

---

## Conclusion

Anchovas and Pepino flip for **different reasons**:

- **Anchovas:** OCR variability (A) — brand token changes, exact-key alias miss/hit
- **Pepino:** Query/load timing (E) + lifecycle persistence (C) — virtual confirmed vs persisted suggested/unmatched, user unmatch between re-reads

Together they produce the observed opposite flip pattern. Neither is a matcher bug or race condition.
