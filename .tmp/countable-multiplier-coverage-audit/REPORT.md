# Countable Multiplier Coverage Audit

**Validation Lab:** `bjhnlrgodcqoyzddbpbd`  
**Mode:** STRICT READ-ONLY — no code changes, no DB writes  
**Audited:** 2026-06-24  
**Corpus:** 52 `invoice_items` (full VL scan)

---

## FINAL VERDICT (A / B / C)

### **A — Isolated (egg/dozen only)**

**Question:** *If we fix Ovo, only eggs or entire missing parser family?*

**Answer:** Fixing Ovo addresses an **isolated egg/dozen gap**. Of 52 VL invoice lines, only **1** countable-multiplier row is BROKEN — `Ovo MORENO Classe M Cx.15 dúzias (CARTÃO)`. All mass/volume multiplier rows (Peroni, Pellegrino, Nata, Chocolate, CX 75CL×15, etc.) parse correctly via existing `size_count` / `count_size` tiers. The missing capability is a **countable-only inner unit** (`dúzias` / dozen → pieces) with no g/ml/cl suffix — not a general parser failure.

---

## Architectural Gap (exactly one)

### **C — Purchase structure parser fails**

| Option | Assessment |
|--------|------------|
| A — OCR never extracts | **Rejected** — `15`, `dúzias`, `Cx.15`, `(CARTÃO)` all present in persisted `name` |
| B — Normalization strips | **Rejected** — `normalizeInvoiceItemFields` preserves full name |
| **C — Parser fails** | **Selected** — `parsePurchaseStructureFromText` returns `null`; no tier handles `Cx.15 dúzias` |
| D — Persistence drops | **Rejected** — nothing parsed to persist; `purchase_quantity` correctly falls back to `1` given `row_only` |

Root cause (same as `.tmp/ovo-countable-root-cause-audit/`):

- `dúzias` / `dz` / `dozen` ∉ `MEASURE_UNIT_TOKEN` and ∉ `INNER_UNIT_TOKEN` (`stock-normalization.ts` lines 155–162)
- `CAIXA_COUNT_ONLY_RE` requires `\bcx\s*\d+` — **dot separator** in `Cx.15` breaks match
- Even a bare `cx 15` match would fail without embedded per-piece g/ml (`findEmbeddedPieceMeasure`)

---

## Scan Summary

| Metric | Value |
|--------|-------|
| Total `invoice_items` scanned | **52** |
| Countable-multiplier candidates | **6** |
| BROKEN | **1** |
| WORKING (countable denom) | **0** |
| N_A_VOLUME (mass/volume tiers OK) | **3** |
| N_A_OTHER (not countable-mult pattern) | **2** |

### Candidate rows (all 6)

| Status | Product | Parser tier | Structured kind |
|--------|---------|-------------|-----------------|
| N_A_OTHER | Ovo Líquido Past.Gema Dovo 1 Kg | `bare_measure` | `weight_or_volume` |
| N_A_OTHER | Ovo Líquido Past.Gema Dovo 1kg | `bare_measure` | `weight_or_volume` |
| **BROKEN** | **Ovo MORENO Classe M Cx.15 dúzias (CARTÃO)** | **`null`** | **`row_only`** |
| N_A_VOLUME | MEZZI PACCHERI MANCINI (CX 1KG*6) | `size_count` | `multi_unit_pack` |
| N_A_VOLUME | POMODORI PELATI (CX 2,5KG*6) | `size_count` | `multi_unit_pack` |
| N_A_VOLUME | ACQUA S.PELLEGRINO (CX 75CL*15) | `size_count` | `multi_unit_pack` |

---

## Denominator Loss Table (BROKEN only)

| Field | Ovo MORENO Classe M |
|-------|---------------------|
| Row | qty=1, unit=`cx`, unit_price=€38.44 |
| Expected denominator | **180** (1 cx × 15 dozen × 12 eggs) |
| Actual `purchase_quantity` | **1** |
| Loss factor | **180×** |
| Unit cost (actual) | €38.44 / recipe `un` (whole case) |
| Unit cost (hypothetical) | €0.214 / egg |
| `parsePurchaseStructureFromText` | `null` |
| `resolveUnitsPerPack` | `null` |
| Matched candidate patterns | `dozen_unit`, `cx_dot_count`, `cx_count_no_measure`, `container_x_count_no_measure`, `egg_product` |
| Tier probes (would-match) | **none** |

---

## Family Classification

| Family | Total | BROKEN | N_A_VOLUME | N_A_OTHER | Notes |
|--------|-------|--------|------------|-----------|-------|
| `dozen_countable` | 1 | **1** | 0 | 0 | Only Ovo — `15 dúzias` |
| `container_bare_count` | 3 | 0 | 3 | 0 | CX prefix + measure multiplier (`1KG*6`, `75CL*15`) — working |
| `egg_countable` | 1 | 1 | 0 | 0 | Subset of Ovo row |
| `container_dot_count` | 1 | 1 | 0 | 0 | `Cx.15` dot separator |
| `none` | 2 | 0 | 0 | 2 | Liquid egg 1 kg — not a multiplier pattern |

No second product family shares the dozen/cx-without-measure failure mode in the VL corpus.

---

## Working Controls — Which Tiers Fire

| Control | VL line | Tier fired | Tier probes | Structured kind | Usable | Operational cost |
|---------|---------|------------|-------------|-----------------|--------|------------------|
| **Peroni** | Birra Peroni Nastro Azzurro PNA 33cl*24 | **`size_count`** | `size_count`, `embedded_bare_measure` | `multi_unit_pack` | 7920 ml | €3.24/L |
| **Pellegrino** | SanPellegrino - Acqua in vitro 75cl x 15ud | **`size_count`** | `size_count`, `embedded_bare_measure` | `multi_unit_pack` | 11250 ml (×2 outer) | €1.71/L |
| **Nata** | Nata Reny Picot 22% 6x1L | **`count_size`** | `count_size` | `multi_unit_pack` | 30000 ml (5 cx) | €3.05/L |
| **Chocolate** | Chocolate Pantagruel 10x200g | **`count_size`** | `count_size` | `multi_unit_pack` | 4000 g (2 cx) | €14.60/kg |
| **Açúcar** | — | **Not in VL corpus** | — | — | — | — |

**Pattern:** All working controls require a **mass or volume token** (`cl`, `L`, `g`, `kg`) in the multiplier chain. Ovo is the sole row where the inner multiplier is a **pure countable unit** (`dúzias`) with no measure suffix.

---

## A / B / C Classification Rationale

| Verdict | Meaning | VL evidence |
|---------|---------|-------------|
| **A — Isolated** | Fix affects eggs/dozen only | **1/52** broken; zero other dozen/dz/cx-without-measure failures |
| B — Small family | Shared pattern, few products | Would need 2–3 broken rows in dozen/cx family — **not observed** |
| C — General parser gap | Entire missing tier breaks many products | **Rejected for scope** — mass/volume multipliers (24×33cl, 6×1L, CX 75CL×15) all WORK |

---

## Smallest Fix Surface

To reach €0.214/egg costing for Ovo:

1. Add parser tier (or extend `INNER_UNIT_TOKEN`) for **dúzias/dz/dozen** → normalize to `un` with factor 12
2. Handle **dot separator** in container tokens (`Cx.15` ≡ `cx 15`)
3. Compose: `1 cx × 15 dozen × 12 = 180 un` → `purchase_quantity: 180`, `cost_base_unit: un`

No changes needed to Peroni/Pellegrino/Nata/Chocolate paths — they already hit `size_count` / `count_size`.

---

## Evidence Files

- `.tmp/countable-multiplier-coverage-audit/results.json` — full machine-readable trace (52-item scan, 6 candidates, controls)
- `.tmp/countable-multiplier-coverage-audit/replay.mts` — replay script (read-only VL + local pipeline)
- Prior single-product audit: `.tmp/ovo-countable-root-cause-audit/`
