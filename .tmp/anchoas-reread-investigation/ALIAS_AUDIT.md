# Alias Audit — Anchoas Re-Read Investigation

**Generated:** 2026-06-14  
**Invoice:** Aviludo April · `c2f52357-0f80-491a-ba14-c97ff4837472`  
**Ingredient:** Anchoas · `c811f67f-df4d-4194-ba8b-7a15d4af38bd`  
**Mode:** READ-ONLY investigation

---

## Ingredient Summary

| Field | Value |
|-------|-------|
| **ingredient_id** | `c811f67f-df4d-4194-ba8b-7a15d4af38bd` |
| **canonical_name** | Anchoas |
| **normalized_name** | `anchoas` |
| **created_at** | 2026-06-07 (from Aviludo May review) |
| **Confirmed alias count** | **8** |

---

## Search: anchov / anchoa / alconfrisa

Query against `ingredient_aliases` for rows matching `%anchov%`, `%anchoa%`, or `%alconfrisa%`.

All hits target ingredient `c811f67f-df4d-4194-ba8b-7a15d4af38bd` (Anchoas).

### AVILUDO-relevant aliases

| alias_name | normalized_alias | supplier | created_at |
|------------|------------------|----------|------------|
| Filete de Anchovas Alconfrisa Lt 495 g | `filete de anchovas alconfrisa 495` | AVILUDO | 2026-06-08 |
| Filete de Anchoas Alcoinfoosa L4 495 g | `filete de anchoas alcoinfoosa 495` | Aviludo | 2026-06-09 |
| Filete de Anchovas Alconfiosa L 495 g | `filete de anchovas alconfiosa 495` | Aviludo | 2026-06-09 |
| Filete de Anchoas Alconfitosa L4 495 g | `filete de anchoas alconfitosa 495` | Aviludo | 2026-06-10 |

Plus 4 Avijudo (May) variants.

### Key alias row (pre-re-read spelling)

| Field | Value |
|-------|-------|
| **alias_id** | `e57a3591…` (truncated in audit) |
| **alias_name** | `Filete de Anchovas Alconfrisa Lt 495 g` |
| **lookup key** | `AVILUDO::filete de anchovas alconfrisa 495` |
| **ingredient_id** | `c811f67f-df4d-4194-ba8b-7a15d4af38bd` |

---

## Does an alias exist that should match this invoice line?

| OCR text | Alias exists? | Lookup key | Result |
|----------|---------------|------------|--------|
| `Filete de Anchovas Alconfrisa Lt 495 g` **(prior)** | **YES** | `AVILUDO::filete de anchovas alconfrisa 495` | Would match |
| `Filete de Anchovas Alconfi sta Lt 495 g` **(current)** | **NO** | `AVILUDO::filete de anchovas alconfi sta 495` | Miss — no row |
| `Filete de Anchovas Alconfirsta L1 495 g` **(phase4a)** | **NO** | — | Miss — no row |

**Answer:** An alias exists for the **Alconfrisa** spelling but **NOT** for the **Alconfi sta** spelling produced by the latest re-read OCR.

---

## Matcher Simulation (live VL catalog + 33 aliases)

| OCR text | Alias hit? | Match result |
|----------|------------|--------------|
| `…Alconfi sta Lt 495 g` **(current)** | ❌ miss | `unmatched` |
| `…Alconfrisa Lt 495 g` **(prior)** | ✅ hit | `confirmed-alias` → Anchoas |
| `…Alconfirsta L1 495 g` **(phase4a)** | ❌ miss | `unmatched` |

---

## Alias Map Keys for Anchoas

Confirmed alias memory keys pointing to `c811f67f-df4d-4194-ba8b-7a15d4af38bd` include variants for:

- `alconfrisa`
- `alcoinfoosa`
- `alconfiosa`
- `alconfitosa`

**Not present:** `alconfi sta` (space-split brand token from current OCR).

---

## Conclusion

Aliases are **not missing** for the canonical brand spelling (`Alconfrisa`). The failure is an **exact-key miss** on a new OCR variant (`Alconfi sta`) that was never manually confirmed and therefore has no persisted alias row.
