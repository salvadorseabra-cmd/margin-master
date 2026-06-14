# Root Cause — OCR Non-Determinism + Alias Sensitivity

**Generated:** 2026-06-14  
**Mode:** READ-ONLY investigation  
**Classification:** **D — OCR non-deterministic + alias sensitivity**

---

## Classification Matrix

| Code | Label | Applies? | Evidence |
|------|-------|----------|----------|
| **A** | OCR deterministic, matcher bug | ❌ | Matcher deterministic per input (`validate-anchoas-reread.mts matcher`) |
| **B** | OCR deterministic, alias bug | ❌ | Alias logic correct; exact-key design is intentional |
| **C** | OCR non-deterministic | ✅ | `.tmp/vl-ocr-rc/ocr-stability-runs.json` — 20+ brand variants |
| **D** | OCR non-deterministic + alias sensitivity | ✅ **ROOT CAUSE** | OCR roulette × exact-key alias miss/hit toggles match |
| **E** | Other | ⚠️ Minor | Alias map evolves mid-session; READ_CUTOVER=OFF affects Pepino display only |

---

## Root Cause Statement

**Anchovas match instability is caused by non-deterministic GPT-4.1 vision OCR producing different brand-token spellings on every re-read, combined with exact-key alias matching that has zero fuzzy tolerance on those tokens.**

The matcher and Match Lifecycle behave correctly when OCR input is stable (Pepino control case).

---

## Mechanism

```
User Re-read
  │
  ▼
Fresh GPT-4.1 vision OCR (no temperature/seed/cache)
  │
  ▼
Brand token roulette: Alconfrisa | Alconfi sta | Alconfirsta | Alconfrista | …
  │
  ├─ exact alias key HIT  → confirmed-alias → MATCHED
  │
  └─ exact alias key MISS → semantic fail (~0.23) → UNMATCHED
```

---

## Five Re-Read Flip Pattern

User-reported: #1 unmatched → #2 matched → #3 matched → #4 unmatched → #5 matched

| Factor | Role |
|--------|------|
| OCR non-determinism | Primary — different brand token each re-read |
| Exact-key aliases | Amplifier — hit/miss binary on spelling |
| Manual confirms mid-session | Modifier — aliases added between re-reads change hit rate |
| Matcher | Not causal — deterministic given input |
| Match Lifecycle | Not causal — shadow seed awaited and deterministic |
| Race conditions | Ruled out — extract path fully awaited |

---

## Contributing Factors (Not Root Cause)

### Alias map evolution

Manual confirms during session added keys for `Alconfi sta` (~15:38Z) and `Alconfrista` (~16:03Z). This changes hit rate over time but does not cause OCR variance.

### READ_CUTOVER=OFF

Affects Pepino display (virtual vs persisted split) but not Anchovas OCR-driven flips.

### CASCADE wipe on re-read

Deletes prior matches — ensures each re-read reflects fresh OCR + fresh seed. Does not introduce non-determinism; exposes OCR variance.

---

## Evidence Chain

1. **OCR varies** — stability runs: 3/3 different on `full` and `table-full` crops
2. **No cache** — re-read always invokes `extract-invoice`
3. **No sampling controls** — `temperature`, `top_p`, `seed` not set
4. **Alias exact-key** — `Alconfi sta` ≠ `alconfrisa` in lookup map
5. **Matcher deterministic** — same variant table on repeated simulation runs
6. **Pepino stable** — same OCR → same match every re-read

---

## What This Is NOT

| Ruled out | Why |
|-----------|-----|
| Matcher bug | Same input → same output, proven by simulation |
| Race condition | Extract + shadow seed fully awaited |
| Lifecycle persistence bug | Behavior matches design (CASCADE + re-seed) |
| Alias logic bug | Exact-key lookup works as specified |

---

## Recommended Fix

### Preferred: OCR stabilization

Set on all 4 `callOpenAiJson` passes in `supabase/functions/extract-invoice/`:

```json
{ "temperature": 0, "seed": <fixed> }
```

Consider deterministic post-processing for known supplier brand tokens.

### Resilience: Alias canonicalization

Before alias lookup, collapse spaced/split brand tokens:

```
alconfi sta  →  alconfrisa
```

Via edit-distance or supplier-specific token folding dictionary.

### Stopgap (insufficient alone)

Manual confirm per OCR variant — already happening (10+ aliases and growing). Does not scale; does not prevent future variants.

---

## Verdict Tag

**`OCR_NON_DETERMINISTIC`**

See `FINAL_VERDICT.md` for required answers and fix priority.
