# Matcher Trace — Anchoas Re-Read Investigation

**Generated:** 2026-06-14  
**Input line:** `Filete de Anchovas Alconfi sta Lt 495 g`  
**Supplier:** AVILUDO  
**Mode:** READ-ONLY simulation against live VL catalog + alias map

---

## Normalization

| Stage | Value |
|-------|-------|
| Raw OCR | `Filete de Anchovas Alconfi sta Lt 495 g` |
| Normalized ingredient name | `filete de anchovas alconfi sta` |
| Alias memory key | `filete de anchovas alconfi sta 495` (approx.) |
| Confirmed alias lookup key | `AVILUDO::filete de anchovas alconfi sta 495` |

---

## Pipeline Steps (current OCR text)

### 1. Override lookup

**Result:** miss — no user override for this OCR key.

### 2. Operational alias

**Result:** miss.

### 3. Confirmed DB alias

**Result:** miss — `AVILUDO::filete de anchovas alconfi sta 495` not in alias map.

Contrast: `Filete de Anchovas Alconfrisa Lt 495 g` hits at this step → `confirmed-alias` → Anchoas immediately.

### 4. Operational memory

**Result:** miss.

### 5. Semantic scoring

Best candidate: **Anchoas** (`c811f67f-df4d-4194-ba8b-7a15d4af38bd`)

| Score field | Value |
|-------------|-------|
| `canonicalIdentityScore` | 0.266 |
| `finalPromotionScore` | 0.226 |
| `semanticScore` | 0 |
| `operationalScore` | 0.226 |
| Min operational threshold | 0.58 |
| **rejectionReason** | `no_safe_family_convergence` |

**Result:** rejected — below promotion threshold.

### 6. Reject pairs

**Result:** no server-side evidence. Reject pairs live in browser localStorage only; not queried in this audit.

---

## Variant Comparison

| OCR text | Alias hit | Match kind | displayState |
|----------|-----------|------------|--------------|
| `Filete de Anchovas Alconfi sta Lt 495 g` | ❌ | — | `unmatched` |
| `Filete de Anchovas Alconfrisa Lt 495 g` | ✅ | `confirmed-alias` | `confirmed` |
| `Filete de Anchovas Alconfirsta L1 495 g` | ❌ | — | `unmatched` |
| `Filete de Anchoas Alconfilosa LI 495 g` | ❌ | — | `unmatched` |

---

## Why Anchoas Was Not Selected

Primary failure: **exact alias key miss** at step 3 due to OCR inserting a space in the brand token (`Alconfrisa` → `Alconfi sta`).

Secondary: semantic fallback scored too low to promote despite partial token overlap (`anchovas` vs `anchoas`). Scoring is intentionally conservative.

---

## Code References

- Alias lookup: `src/lib/ingredient-alias-lookup.ts` — exact-key lookup via `lookupIngredientIdFromAliasMap`
- Alias map build: `src/lib/ingredient-alias-memory.ts` — `buildConfirmedAliasMapFromRows`
- Match propagation: `src/lib/invoice-ingredient-match-propagation.ts` — `findInvoiceItemIngredientMatch`
- Normalization: `src/lib/ingredient-canonical.ts` — `normalizeInvoiceIngredientName`
- Override keys: `src/lib/ingredient-match-override.ts` — `buildOverrideKeysFromInvoiceLine`

---

## Answer

Anchoas was not selected because the re-read OCR produced a brand-token variant with no persisted alias, and the semantic tier did not compensate. This is **expected matcher behavior** for exact-key alias memory — not a lifecycle or shadow-seed defect.
