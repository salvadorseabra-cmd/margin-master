# Root Cause — Anchoas Re-Read Investigation

**Generated:** 2026-06-14  
**Classification:** **C — OCR variation broke alias matching**

---

## Classification Options

| Code | Description | Applies? |
|------|-------------|----------|
| **A** | Alias missing | ❌ Alias exists for `Alconfrisa` |
| **B** | Alias exists but ignored | ❌ Alias works for exact `Alconfrisa` string |
| **C** | OCR variation broke alias | ✅ **ROOT CAUSE** |
| **D** | Reject pair / memory blocked | ❌ No evidence |
| **E** | Lifecycle state prevented | ❌ Lifecycle correctly seeded unmatched |
| **F** | Other | ❌ |

---

## Evidence Chain

### 1. Confirmed alias exists (rules out A)

Ingredient `c811f67f-df4d-4194-ba8b-7a15d4af38bd` (Anchoas) has **8 confirmed aliases**, including:

```
Filete de Anchovas Alconfrisa Lt 495 g
→ key: AVILUDO::filete de anchovas alconfrisa 495
```

### 2. Alias is not ignored for prior text (rules out B)

Matcher simulation on `Filete de Anchovas Alconfrisa Lt 495 g`:

- Alias hit at step 3
- Returns `confirmed-alias` → Anchoas immediately

### 3. Re-read produced new OCR variant (C)

Jun 14 re-read OCR:

```
Filete de Anchovas Alconfi sta Lt 495 g
→ key: AVILUDO::filete de anchovas alconfi sta 495  (NOT in map)
```

Space inserted in brand token: `Alconfrisa` → `Alconfi sta`.

### 4. No reject/memory/lifecycle block (rules out D, E)

- Shadow seed: ✅ ran, seeded `unmatched` correctly
- Reject pairs: no server-side block
- Operational memory: miss (expected)
- 8 sibling lines rematched via `confirmed-override` — lifecycle works

### 5. Semantic fallback insufficient (secondary)

Semantic tier scored Anchoas at 0.226 final promotion (min 0.58 operational). Rejection: `no_safe_family_convergence`. This is a **secondary** failure; primary is alias key miss at step 3.

---

## Mechanism

```
Prior OCR:  "…Alconfrisa…"  → alias HIT  → confirmed-alias
Re-read OCR: "…Alconfi sta…" → alias MISS → semantic FAIL → unmatched
```

Alias memory uses **exact normalized keys**. OCR brand-token splitting is a known VL failure mode (see `.tmp/vl-ocr-rc/ocr-stability-runs.json`).

---

## Bug vs Expected Behavior

| Question | Answer |
|----------|--------|
| Is this a matcher bug? | **NO** — exact-key alias lookup behaved as designed |
| Is this a lifecycle bug? | **NO** — shadow seed and persistence correct |
| Is this a re-read bug? | **NO** — re-read correctly re-extracted and re-matched |
| Is this expected limitation? | **YES** — alias memory does not fuzzy-match OCR variants |

**Product gap (not code defect):** semantic tier could arguably promote `anchovas` → `anchoas` when 8 sibling lines are confirmed, but current scoring is intentionally conservative.

---

## Recommended Fix

1. **Immediate:** Manually confirm Anchoas on the April line → persists alias for `Alconfi sta` variant.
2. **Resilience:** Add fuzzy brand-token normalization before alias lookup (`alconfi sta` ↔ `alconfrisa`), or fuzzy alias matching for ingredients with multiple OCR variants already on file.
3. **Optional:** T8 preserve policy on re-read for prior confirmed matches (not implemented).
