# Infer `un` for Embedded-Measure Countables — Safety Analysis

**Validation Lab:** `bjhnlrgodcqoyzddbpbd`  
**Mode:** STRICT READ-ONLY — no code/DB writes  
**Audited:** 2026-06-23

## Executive Answer

| Question | Answer |
|----------|--------|
| Can `resolveInvoicePersistedItemUnit` **safely** infer `un` under the **naive** rule? | **NO** |
| Can it safely infer `un` under a **gated** rule? | **CONDITIONAL YES** |
| Risk (naive) | **HIGH** |
| Risk (gated, current VL) | **LOW** |
| Risk (gated, null-OCR stress) | **LOW–MEDIUM** |

---

## Verdict

### Naive rule — **NO** (HIGH risk)

```
OCR unit null AND kind === weight_or_volume AND quantity > 1 → infer "un"
```

**Do not ship as-is.** Under null-OCR stress across the full 52-item VL corpus, this gate matches **16 rows** and would assign `un` to **7 rows that should remain kg/em**, with **CALCULATION_RISK** (usable quantity and €/kg diverge). In the **current DB**, only Paccheri and Ginger have `unit=null`, so the naive rule fixes 2 rows today — but it is not safe as a general resolver policy because GPT unit omission is run-dependent and could expose bulk/deli rows later.

### Conditional safe gate — **CONDITIONAL YES** (LOW risk)

```
OCR unit is null
AND resolveInvoiceLinePurchaseFormat().kind === "weight_or_volume"
AND Number.isInteger(quantity) AND quantity > 1
AND name embeds retail g/ml/cl (NOT kg/L purchase denomination)
AND name lacks pack-denomination markers (EMB, CX, CAIXA, PACK)
AND resolveInvoiceLinePurchaseUnit() returns fallback_null
→ infer "un"
```

| Scope | Hits | Impact |
|-------|-----:|--------|
| Current VL DB (52 rows) | **2** (Paccheri, Ginger) | DISPLAY_ONLY |
| Null-OCR stress (all 52) | **5** | 3 idempotent (`un`→`un`); 0 regressions vs current DB units |

---

## Root Cause (why Paccheri/Ginger lose `un`)

GPT Pass C often omits `unit` for Emporio countable rows whose names embed **g/ml/cl** (`500g`, `0.20cl`). Names without multipack markers (`*24`, `10x1kg`, `CX`) parse as `weight_or_volume`, not `multi_unit_pack`.

`resolveInvoiceLinePurchaseUnit` (`invoice-purchase-format.ts:1434–1496`):

1. `preserveCountableExtractedUnit` — only fires when OCR supplies generic countable unit (non-null `un`)
2. `multi_unit_pack` / `unit_count` branches — infer `un` (Peroni, Pellegrino, Pomodori, Mozzarella)
3. `name_weight_denomination` — only for **kg/L** embedded in name (`embeddedPurchaseDenominationFromName`, lines 1402–1406)
4. **`fallback_null`** — g/ml/cl embedded rows with null OCR (Paccheri, Ginger)

`resolveInvoicePersistedItemUnit` (lines 1504–1516) delegates to the above; no additional backfill.

### `weight_or_volume` vs `multi_unit_pack`

Determined in `parsePurchaseFormatPhrase` / `parsedPhraseFromPurchaseStructure` (`invoice-purchase-format.ts:351–446, 273–283`):

| Pattern in name | Kind | Example |
|-----------------|------|---------|
| `N x SIZE unit` / `*N` with measure | `multi_unit_pack` | `33cl*24`, `CX 75CL*15`, `125GR*8` |
| Bare embedded g/ml/cl/kg | `weight_or_volume` | `500g`, `0.20cl`, `2,5 Kg` (no outer-count marker) |

Paccheri `500g` and Ginger `0.20cl` → `weight_or_volume` (containerCount=1, per-item measure). Peroni `33cl*24` → `multi_unit_pack` → existing `un` inference without OCR.

---

## Corpus Replay (52 VL items)

Replay: `.tmp/resolve-unit-infer-un-safety/replay.mts` → `results.json`

### Naive rule stress

| Metric | Count |
|--------|------:|
| `weight_or_volume` + null OCR + qty>1 | 16 |
| Would infer `un` (vs baseline null-OCR resolver) | 16 |
| CALCULATION_RISK false positives | **7** |
| DISPLAY_ONLY fixes (Paccheri, Ginger) | 2 |

**False-positive examples (naive rule, null-OCR stress):**

| Product | DB unit | Qty | Should be | Impact |
|---------|---------|-----|-----------|--------|
| Manteiga Coimbra EMB 1 Kg | `kg` | 8 | `kg` | CALCULATION_RISK |
| Gorgonzola 1,5kg | `kg` | 2 | `kg` | CALCULATION_RISK |
| Prosciutto 4,3–4,5KG | `kg` | 4.3 | `kg` (counter-weight) | CALCULATION_RISK |
| Mortadella 3,5kg | `kg` | 3.11 | `kg` (counter-weight) | CALCULATION_RISK |
| Bresaola 1,5kg | `kg` | 1.83 | `kg` (counter-weight) | CALCULATION_RISK |
| Salame Ventricina 2,5 Kg | `kg` | 2.6 | `kg` (counter-weight) | CALCULATION_RISK |
| Salada Ibérica EMB. 250g | `em` | 4 | `em` | CALCULATION_RISK |

### Gated rule (current DB)

Only **Paccheri** and **Ginger** match — both `DISPLAY_ONLY` (Last Purchase `24` → `24 un`; usable/cost unchanged per `.tmp/missing-unit-population-audit/`).

---

## Regression Matrix (must-not-regress)

| Product | DB unit | Structured kind | Current resolved | Naive rule change? | Gated rule change? |
|---------|---------|-----------------|------------------|--------------------|--------------------|
| Peroni 33cl*24 | `un` | `multi_unit_pack` | `un` | No | No |
| Pellegrino 75cl×15 | `un` | `multi_unit_pack` | `un` | No | No |
| Açúcar 10x1kg | `cx` | `multi_unit_pack` | `cx` | No* | No |
| Pomodori 2.5kg×6 | `un` | `multi_unit_pack` | `un` | No | No |
| Mozzarella 125g×8 | `un` | `multi_unit_pack` | `un` | No | No |
| Guanciale | `un` | `multi_unit_pack` | `un` | No | No |

\*Açúcar would become `un` only if OCR `cx` were stripped (multi_unit_pack path already infers `un`); gated rule does not fire because kind ≠ `weight_or_volume`.

---

## Guanciale Deep Dive

| Field | Value |
|-------|-------|
| Product | Guanciale di suino stagionato +/- 1,5kg*7 Sorrentino |
| DB qty / unit | 5.996 / `un` |
| Counter-weight priced | **Yes** (non-integer qty) |
| Structured kind | **`multi_unit_pack`** (name has `1,5kg*7`) |
| Naive gate fires? | **No** (not `weight_or_volume`) |
| Gated gate fires? | **No** |
| Impact if inferred | **NONE** |

Guanciale is on the **billed-weight / counter-scale** path (qty ≈ kg purchased). The `*7` marker routes to `multi_unit_pack`; integer-qty gate would also block 5.996. **No regression risk** from either rule variant.

Prior note: usable-stock scaling for Guanciale is a separate stock-normalization issue (`.tmp/remaining-bug-root-causes/REPORT.md`); **unit inference does not affect it**.

---

## Impact: Display vs Calculations

For Paccheri and Ginger (the only DB rows the gated rule touches):

| Path | null unit | inferred `un` | Differs? |
|------|-----------|---------------|----------|
| `formatRowPurchaseQuantityLabel` | `24` | `24 un` | Yes (display) |
| `computeUsableFromPurchaseStructure` | 12,000 g / 4,800 ml | same | No |
| `computeEffectiveUsableCost` | €4.20/kg, €4.05/L | same | No |
| `recipeOperationalCostFieldsFromInvoiceLine` | same procurement fields | same | No |

Corroborated by `.tmp/missing-unit-population-audit/` (impact: **DISPLAY_ONLY** for both rows).

Salada Ibérica (`em` → forced `un` under naive rule) shows **CALCULATION_RISK**: usable 250 g → 1,000 g, cost €2.19/case → €8.76/kg — demonstrates why the naive rule is unsafe.

---

## Prior Audit Corroboration

| Audit | Relevant finding |
|-------|------------------|
| `.tmp/invoice-unit-persistence-audit/` | Paccheri/Ginger lose unit at `fallback_null` on `weight_or_volume`; multipack-named products unaffected |
| `.tmp/missing-unit-population-audit/` | Only 2/52 VL rows have qty>1 + null unit; both expected `un`; zero calculation divergence |
| `.tmp/purchase-unit-representation-audit/` | Last Purchase reads `invoice_items.unit`; null → bare quantity |

---

## Recommendations (analysis only — no implementation)

1. **Do not** add bare `weight_or_volume + qty>1 → un`.
2. **If fixing**, use the **6-condition gated rule** above; it matches exactly Paccheri + Ginger in VL with DISPLAY_ONLY impact.
3. **Prefer also** hardening GPT Pass C to return `un` for countable Emporio rows (historical invoice `17aa3591` did persist `un`).
4. **Monitor** Salada-class rows (`EMB` + g embed): excluded by pack-marker gate; do not remove that guard.

---

## Evidence Files

- `.tmp/resolve-unit-infer-un-safety/REPORT.md` — this report
- `.tmp/resolve-unit-infer-un-safety/results.json` — full 52-row replay + verdict
- `.tmp/resolve-unit-infer-un-safety/replay.mts` — read-only replay script
- `src/lib/invoice-purchase-format.ts` — `resolveInvoicePersistedItemUnit`, `resolveInvoiceLinePurchaseUnit`
- `.tmp/invoice-unit-persistence-audit/`, `.tmp/missing-unit-population-audit/`, `.tmp/purchase-unit-representation-audit/`
