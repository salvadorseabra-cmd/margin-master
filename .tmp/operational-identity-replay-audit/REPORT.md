# Operational Identity Replay Audit — Model D (Layered Identity)

**VL:** `bjhnlrgodcqoyzddbpbd` · **Mode:** STRICT READ-ONLY · **Generated:** 2026-06-25

## Verdict

Model D replay across all **51 VL invoice lines** recovers the live **Prosciutto** regression with **zero material regressions**, **zero ingredient_id changes**, and **zero confirmed-match breaks**. One pre-existing alias collision is surfaced; blast radius **LOW**.

**Confidence: 89%**

---

## Simulation method

| Layer | Path |
|-------|------|
| **Current** | `buildOverrideKeysFromInvoiceLine` → `normalizeOperationalAliasKey` (production) |
| **Model D** | `stripInvoiceBrandPrefix` → `normalizeOperationalAliasKey` on read **and** alias-row re-derive |
| **Lookup** | Supplier-scoped + global alias map from 69 `ingredient_aliases` rows |
| **Beverage guard** | San Pellegrino **not** in `INVOICE_BRAND_PREFIX_STRIP_RE` |

Script: `.tmp/operational-identity-replay-audit/replay.mts` · Evidence: `results.json`

---

## T1 — Full corpus replay (51 rows)

Every row replayed with: raw name, display name, current alias key, proposed operational identity, current match, predicted match, confidence. Full per-row detail in `results.json → rowReplays`.

### Material change summary

| Metric | Count |
|--------|------:|
| Total rows | 51 |
| Material changes | **1** |
| Unchanged (material) | **50** |
| Cosmetic (`confirmed-override` → `confirmed-alias`, same ingredient) | 35 |
| Unchanged (strict, incl. cosmetic) | 15 |

The single material change is **Prosciutto**: `suggested/semantic` → `confirmed/confirmed-alias`, same `ingredient_id`.

---

## T2 — Impact counts

| Category | Count | Notes |
|----------|------:|-------|
| **Recovered confirmed** | 1 | Prosciutto: Possible match → Matched automatically |
| **Recovered suggested** | 0 | — |
| **Unchanged (material)** | 50 | Same ingredient_id + status |
| **False positives** | 0 | No unmatched → wrong confirmed |
| **Regressions** | 0 | No alias miss introduced |
| **Collisions (canonical)** | 1 | Pre-existing duplicate alias → 2 ingredients |
| **Alias merges** | 1 | Same identity, duplicate rows |
| **Prefix rows** | 7 | Brand-prefix on invoice line |
| **Prefix rows with material change** | 1 | Prosciutto only |

---

## T3 — Known products replay

| Product | Current | Predicted | Alias key delta | Material change? |
|---------|---------|-----------|-----------------|------------------|
| **Prosciutto** | suggested / semantic | **confirmed / confirmed-alias** | `rovagnati assaporami…` → `assaporami…` | **Yes — fixed** |
| Mortadella | confirmed / override | confirmed / alias | prefix stripped both sides | No |
| Bresaola | confirmed / override | confirmed / alias | `rigamonti …` → `bresaola …` | No |
| Gorgonzola | confirmed / override | confirmed / alias | `arrigoni formaggi …` → product only | No |
| Paccheri (Mezzi) | confirmed / override | confirmed / alias | unchanged | No |
| Paccheri (De Cecco) | confirmed / override | confirmed / alias | `de cecco …` → `paccheri lisci …` | No |
| Chocolate | confirmed / override | confirmed / alias | unchanged | No |
| Atum | confirmed / override | confirmed / alias | unchanged | No |
| Mozzarella | confirmed / override | confirmed / alias | unchanged | No |
| Pepino | confirmed / alias | confirmed / alias | unchanged | No |
| Pellegrino | confirmed / override | confirmed / alias | **not stripped** (beverage) | No |

### Prosciutto evidence

```
Raw:     Rovagnati - Assaporami Prosciutto Cotto Scelto HC 4,3-4,5kg
Display: Prosciutto cotto scelto
Current key:  rovagnati assaporami prosciutto cotto sceltohc  → MISS
Model D key:  assaporami prosciutto cotto sceltohc            → HIT
Current:  suggested / semantic / Prosciutto cotto scelto
Predicted: confirmed / confirmed-alias / Prosciutto cotto scelto (same ingredient_id)
```

Aligns with prior audits: `.tmp/possible-match-regression-audit/`, `.tmp/brand-prefix-alias-coverage-audit/`.

---

## T4 — Collision audit

**1 canonical collision** (pre-existing, not introduced by Model D):

| Operational identity | Aliases | Ingredient IDs |
|---------------------|---------|----------------|
| `Mammafiore Portugal::mozzarella fior di latte expet julienne simonetta` | 2× identical alias_name | `2a99cecd…` (Mozzarella fior di latte) **vs** `5e9e7f89…` (Mozzarella julienne) |

Duplicate DB rows for the same supplier line pointing at different catalog ingredients. Model D does not create this collision but does not resolve it — cleanup recommended before production spine change.

No new collisions from brand-prefix stripping across the 7 prefix rows.

---

## T5 — Historical confirmations

| Metric | Value |
|--------|------:|
| Total confirmed rows | 49 |
| Resolve via Model D alias | 46 |
| **Material breaks** | **0** |
| Alias-only confirm gaps (pre-existing) | 3 |

The 3 alias-only gaps are rows confirmed via **semantic/exact** paths today (Farina Speciale pizza, Anchoas, Nata Culinaria). Model D does not break them — same `ingredient_id`, same `confirmed` status. These gaps exist before Model D; alias layer miss is not a regression.

**Every historical Confirm Match still resolves to the same ingredient.**

---

## T6 — Supplier intelligence impact (measure only)

| Metric | Current | Model D |
|--------|--------:|--------:|
| Alias map keys | 132 | 132 |
| Unique operational keys | 66 | 66 |
| Supplier-scoped alias rows | 69 | 69 |

No supplier-scope key geometry change. Prefix strip is orthogonal to supplier identity key (`normalizeSupplierDisplayName` / `supplier::alias`).

---

## T7 — Recipe impact

| Metric | Value |
|--------|------:|
| `ingredient_id` changes | **0** |
| Confirmed ingredient_id changes | **0** |

**Recipe costing unchanged.** Prosciutto recovery promotes alias path but targets the same ingredient already suggested semantically.

---

## T8 — Blast radius

**LOW**

- 1/51 material improvement (Prosciutto status promotion)
- 0 regressions, 0 ingredient_id drift
- 1 pre-existing collision to clean up
- 7 prefix rows: 6 unchanged materially, 1 fixed
- Beverage (Pellegrino): no strip, no change

---

## Final answers

| # | Question | Answer |
|---|----------|--------|
| 1 | Rows improve? | **Yes — 1** (Prosciutto suggested→confirmed) |
| 2 | Regress? | **No — 0** material regressions |
| 3 | Collisions? | **Yes — 1** pre-existing (mozzarella julienne duplicate alias) |
| 4 | Prosciutto fixed? | **Yes** — alias hit restored, same ingredient |
| 5 | Confirmed breaks? | **No — 0** material breaks on 49 confirmed rows |
| 6 | Recipe changes? | **No** — 0 ingredient_id changes |
| 7 | Model D production-ready? | **Almost** — spine change safe for VL; resolve duplicate alias collision first |
| 8 | A/B/C/D next step? | **D** with pre-deploy duplicate-alias cleanup; A rejected, B/C insufficient alone |

---

## Model comparison (replay evidence)

| Model | VL replay outcome |
|-------|-------------------|
| A (raw) | Would not fix Prosciutto; OCR drift risk |
| B (canonical display only) | Display already strips; alias miss persists |
| C (multi-alias recall) | No normalization spine; same Prosciutto miss |
| **D (layered)** | **Fixes Prosciutto; 0 regressions; aligns display + alias spine** |

---

## Recommended deployment sequence

1. **Phase 1:** Add `stripInvoiceBrandPrefix` to shared alias normalization spine (read + write), excluding beverages.
2. **Phase 2 (pre-deploy):** Deduplicate `MOZZA Fior di Latte Expet Julienne 3kg Simonetta` alias collision.
3. **Phase 3 (measure):** Re-run this replay on production after deploy; expect Prosciutto `confirmed` without other drift.

---

## Prior audit references

- `.tmp/operational-identity-canonicalization-audit/design.json`
- `.tmp/alias-write-path-consistency-audit/`
- `.tmp/brand-prefix-alias-coverage-audit/`
- `.tmp/possible-match-regression-audit/`
