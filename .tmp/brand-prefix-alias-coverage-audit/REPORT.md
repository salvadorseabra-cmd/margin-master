# Brand Prefix Alias Coverage Audit

**VL:** `bjhnlrgodcqoyzddbpbd` · **Mode:** STRICT READ-ONLY

## Verdict: **D) Structural normalization gap**

Display strips `Brand -` prefixes; alias lookup does not. Live regression: **Prosciutto only** (1/51 rows). At-risk pattern: **6–8** Italian prefix rows.

**Confidence: 86%**

---

## Root divergence

| Path | Brand prefix strip? |
|------|---------------------|
| Display (`canonical-ingredient-display-name.ts`) | **Yes** — `INVOICE_BRAND_PREFIX_STRIP_RE` |
| Alias (`normalizeOperationalAliasKey`) | **No** |

Prosciutto: alias stored without `Rovagnati -`; re-read line gained prefix → miss → semantic → Possible match.

---

## Corpus statistics

| Metric | Value |
|--------|-------|
| Total VL items | 51 |
| Brand-prefix rows | 8 |
| Live alias regressions | 1 (Prosciutto) |
| Recovered by prefix removal | 1 |
| Display/alias gap rows | 6 |

---

## Brand prefix inventory (VL)

| Prefix | Rows | Display strips | Alias strips |
|--------|------|----------------|--------------|
| Rovagnati | 3 | Yes | No |
| Rigamonti | 1 | Yes | No |
| Arrigoni Formaggi | 1 | Yes | No |
| De Cecco | 1 | Yes | No |
| Baladin | 1 | Yes | No |
| SanPellegrino | 1 | **Must not strip** | No |

---

## Regression candidates

| Product | Active? | Why |
|---------|---------|-----|
| **Prosciutto** | **Yes** | Alias without prefix; line with prefix |
| Mortadella | No | Alias stored with prefix |
| Gorgonzola | No | Alias stored with prefix |
| Bresaola | No | Alias stored with prefix |
| Pepino/Tomilho/Mozzarella/etc. | No | No brand prefix |

---

## False-positive risks (theoretical)

- San Pellegrino / Peroni beverage strip — **HIGH**
- Assaporami/HC over-strip vs stored alias geometry — **MEDIUM**
- Read/write asymmetry (aliases stored with prefix on some SKUs) — **MEDIUM**

No live false positives observed.

---

## Final answers

1. Products affected live: **1**; at-risk pattern: **6–8**
2. Aliases recover: **1** (Prosciutto)
3. False positives observed: **None**
4. One normalization fix multiple: **Yes** (read+write alias path alignment)
5. Classification: **D**
6. Confidence: **86%**

---

## Relation to prior audits

Confirms [possible match regression audit](2a540841-f4c4-425f-b75d-ed064ea17896) root cause at alias layer, not scoring/UI. Fix scope: align alias lookup with display brand-prefix stripping (read **and** write paths); exclude beverages.
