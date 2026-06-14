# Matcher Variant Analysis

**Generated:** 2026-06-14  
**Mode:** READ-ONLY investigation  
**Live simulation:** `scripts/validate-anchoas-reread.mts matcher` (2026-06-14T16:05Z)  
**Catalog:** Live VL canonical ingredient catalog  
**Alias map:** Live DB snapshot (10+ Anchoas aliases)

---

## Question

Does match outcome change solely because OCR text changes?

**Answer: YES.**

Same catalog, same alias map, same matcher code — only the input invoice line name differs.

---

## Matcher Simulation Results

| OCR variant | Alias hit | Semantic | Final outcome |
|-------------|-----------|----------|---------------|
| `Filete de Anchovas Alconfi sta Lt 495 g` | ✅ `confirmed-alias` | — | **confirmed** |
| `Filete de Anchovas Alconfrisa Lt 495 g` | ✅ `confirmed-alias` | — | **confirmed** |
| `Filete de Anchovas Alconfirsta L1 495 g` | ❌ | rejected 0.23 (`no_safe_family_convergence`) | **unmatched** |
| `Filete de Anchoas Alconfilosa LI 495 g` | ❌ | rejected 0.31 (`weak_canonical_overlap`) | **unmatched** |

Note: `Alconfi sta` shows as HIT in simulation at 16:05Z because alias was added at ~15:38Z during the investigation session. At re-read #2 time it was a MISS → unmatched.

---

## Match Pipeline Steps

For each invoice line, `findInvoiceItemIngredientMatch()` runs:

```
Step 1: Override lookup     → confirmed-override (if user confirmed this exact line before)
Step 2: Confirmed alias     → confirmed-alias (exact key hit on ingredient_aliases)
Step 3: Semantic match      → suggested / rejected (score vs threshold 0.58)
Step 4: No match            → unmatched
```

Anchovas outcomes are determined at **Step 2** (alias hit) or fall through to **Step 3** (semantic reject) → **Step 4** (unmatched).

---

## Outcome Toggle Mechanism

```
OCR variant
  │
  ├─ exact alias key HIT  → confirmed-alias → MATCHED (display: confirmed)
  │
  └─ exact alias key MISS → semantic ~0.23  → UNMATCHED
```

No matcher randomness. No race condition. Pure function of OCR string + alias map snapshot.

---

## Five Re-Read Pattern Explained

| Re-read | User saw | OCR landed on | Alias state at time |
|---------|----------|---------------|---------------------|
| #1 | unmatched | miss key (`Alconfirsta`) | no alias |
| #2 | matched | hit key (`Alconfrisa` or similar) | alias exists |
| #3 | matched | hit key | alias exists |
| #4 | unmatched | miss key (new variant) | no alias for variant |
| #5 | matched | hit key (`Alconfrista`) | alias added after #4 confirm |

Flip pattern = **OCR variant roulette × exact-key alias map**, not matcher bug.

---

## Pepino Contrast

| Aspect | Anchovas | Pepino |
|--------|----------|--------|
| OCR stability | ❌ Brand token changes every re-read | ✅ Text stable (`Pepino Extra III…`) |
| Alias sensitivity | High — 20+ possible miss keys | Low — stable key |
| Apparent flip source | OCR → alias miss/hit | Virtual/persisted split + user actions |
| Matcher deterministic? | ✅ Yes, given fixed OCR | ✅ Yes |

Pepino proves Match Lifecycle works when OCR is stable.

---

## Shadow Seed Behavior

When `VITE_MATCH_LIFECYCLE_SHADOW_SEED=true`:

- Shadow seed runs **after** extract, **awaited** (not fire-and-forget)
- Seeds `invoice_item_matches` from matcher output
- Deterministic given fixed OCR + alias map
- No T8 preserve policy — CASCADE wipe on re-read deletes prior matches

Match Lifecycle is **not** the source of Anchovas instability.

---

## Validation Commands

```bash
# Matcher simulation for OCR variants
npx vite-node scripts/validate-anchoas-reread.mts matcher

# Full re-read determinism audit (Anchovas + Pepino)
npx vite-node scripts/validate-reread-determinism.mts baseline
npx vite-node scripts/validate-reread-determinism.mts matcher
```

---

## Conclusion

Matcher is **deterministic and correct** for its design (exact-key aliases + conservative semantic). Outcome changes solely because OCR text changes. Fix belongs upstream (OCR stability) or at alias lookup (fuzzy brand token canonicalization).
