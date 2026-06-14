# Impact Analysis — Brand Token OCR Drift

**Investigation date:** 2026-06-14  
**Scope:** Validation Lab (`bjhnlrgodcqoyzddbpbd`) — all confirmed `ingredient_aliases`

---

## Database Snapshot

| Metric | Value |
|--------|-------|
| Total confirmed alias rows | **36** |
| Unique ingredients with aliases | **10** |
| Ingredients with 2+ aliases | **9** |
| Ingredients with multiple distinct normalized keys | **9** |
| Single-alias ingredients | **1** (Pepino fresco) |

---

## OCR Noise Penetration

| Category | Ingredients | Alias rows | % of total |
|----------|-------------|------------|------------|
| Brand OCR noise (edit-dist ≤3 on collapsed stem) | 6 | 27 | 75% |
| Format spacing only | 2 | 4 | 11% |
| Structural difference (not OCR) | 1 | 2 | 6% |
| Stable (single alias) | 1 | 1 | 3% |
| **OCR-affected (noise + format)** | **8** | **33** | **92%** |

**Key finding:** 8 of 9 multi-alias ingredients (92%) sit in OCR-noise families. Anchoas is the worst case but not an outlier.

---

## Redundant Alias Row Estimate

Applying brand-token canonicalization (prefix strip + space-collapse + edit-distance ≤2 clustering):

| Ingredient | Current aliases | Canonical brand keys | Rows saveable |
|------------|-----------------|---------------------|---------------|
| Anchoas | 10 | 2 (1 per supplier) | 8 |
| Pepino conserva | 6 | 1–2 | 4–5 |
| Atum em óleo | 6 | 2 | 4 |
| Nata culinária | 3 | 1 | 2 |
| Mozzarella fior di latte | 2 | 1 | 1 |
| Gema líquida | 2 | 1 | 1 |
| Arroz agulha | 2 | 1 | 1 |
| Açúcar branco | 2 | 1 | 1 |
| Chocolate culinária | 2 | 2 | 0 |
| Pepino fresco | 1 | 1 | 0 |
| **Total** | **36** | **~14–16** | **~20** |

**~20 alias rows (56% of DB) are collapsible** to canonical brand fingerprints without losing recall.

---

## Matching Failure Impact

### Anchoas — live matcher simulation

| Scenario | Hit rate | Misses |
|----------|----------|--------|
| Current exact-key lookup | 3/5 (60%) | `Alconfirosa`, `Alconfirsta` |
| Space-collapse on brand stem | 4/7 (57%) | Split-token variants partially fixed |
| Fuzzy brand-stem ed≤2 | 5/7 (71%) | 2 residual edge cases |

### Immediate fix without new alias confirms

**~40% of tested Anchoas variant misses** would disappear (2 of 5 in the primary matcher sim), including the post-hardening stable `Alconfirosa` miss.

### With full Hybrid D implementation

**~71% of tested variants** recovered (5 of 7). AVILUDO April invoice drops from 1 recurring failure line to 0 for typical OCR drift patterns.

### Invoice-level impact

| Invoice | Lines | Current failures | After Hybrid D |
|---------|-------|------------------|----------------|
| AVILUDO April | 9 | 1 (~11%) | 0 (typical OCR drift) |

---

## Whitespace vs Character Drift

| Difference type | Count | Notes |
|-----------------|-------|-------|
| Whitespace-only differences | **0** | No ingredient has aliases differing only by spaces |
| Character-level OCR noise | **33 rows** | Transpositions, substitutions, split tokens |
| Format spacing (Metro Chef) | **4 rows** | `12x1 kg` vs `12x1kg`, `metro chef` vs `metrochef` |

All meaningful drift requires character-level normalization, not just trim/collapse.

---

## Cross-Ingredient Failure Heuristic

Simulating OCR stability run lines against current alias normalized sets:

| Ingredient | Unique OCR line misses (heuristic) | Root cause |
|------------|-----------------------------------|------------|
| Anchoas | 5+ | Brand token drift (`Alconfirosa`, etc.) |
| Pepino conserva | 3+ | Extra VII garbling, `pepinoso` |
| Atum em óleo | 2+ | Bolsa/Boisa, Catrieta variants |
| Mozzarella | 1 | Fior/Flor |
| Nata culinária | 1 | Reny/Remy |
| Gema líquida | 1 | Gema/Gemo |

Pepino *appears* stable on Bidfood invoices only because OCR frequently returns the bare word `"Pepino"` — which happens to match a stored alias. This masks the same underlying exact-key fragility.

---

## Cost of Status Quo (Option A)

| Cost dimension | Current state |
|----------------|---------------|
| Manual confirms per OCR drift | 10 Anchoas rows and growing |
| User-visible re-read failures | 1/9 lines on AVILUDO April |
| DB row growth | Linear with OCR runs — unbounded |
| Developer maintenance | Each new OCR spelling needs investigation + manual alias |

At 14 unique OCR spellings for a single product (same PDF), manual alias confirmation cannot scale.

---

## Impact Summary

| Question | Answer |
|----------|--------|
| How systemic is the problem? | **92% of alias rows** in OCR-noise families |
| How many rows are redundant? | **~20 of 36** (56%) |
| How many matcher misses fixed immediately? | **~40%** of Anchoas variants (no new DB rows) |
| How many with full Hybrid D? | **~71%** of Anchoas variants |
| Is Anchoas isolated? | **No** — worst case of a systemic exact-key problem |
