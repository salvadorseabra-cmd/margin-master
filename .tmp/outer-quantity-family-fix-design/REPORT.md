# Outer Quantity Scaling Family — Fix Design

**Generated:** 2026-06-23  
**Validation Lab:** `bjhnlrgodcqoyzddbpbd`  
**Mode:** STRICT DESIGN ONLY — no code changes, no DB writes, no deployments

---

## Executive Summary

Six invoice lines in VL share one defect: **invoice outer quantity (`rowQty > 1`) is discarded** because `structureTotalIsFinalForGenericRow` (and related gates) treat the name-parsed pack total as the full line usable. Mozzarella (`125GR×8`, g) was fixed via `shouldScaleOuterPackForSizeCountGenericRow`; the **remaining** broken rows span two parser tiers:

| Tier | Broken products | Unit | Missing transform |
|------|-----------------|------|-------------------|
| `size_count` | Pellegrino 75cl×15 | cl (volume) | `rowQty × structure_total` |
| `count_size` | Nata 6×1L, Chocolate 10×200g | L, g | `rowQty × structure_total` |

**Recommended fix (Option A):** Extend the existing Mozzarella outer-scaling pattern with two narrow helpers — volume units on `size_count`, case-unit outer scaling on `count_size` — wired through the same integration points (`resolveStructurePurchaseQuantity`, `computeUsableFromPurchaseStructure`). **Readiness: A) Ready for implementation.**

---

## 1. Family Map Table

| Product | Tier | Measurement | RowQty | RowUnit | Current Behaviour | Status |
|---------|------|-------------|--------|---------|-------------------|--------|
| **Pellegrino** `75CL×15` / `75cl x 15ud` | `size_count` | cl → ml | 2 | `un` | `structure_total` 11.25 L (1 case); `rowQty` ignored | **BROKEN** |
| **Nata** `6×1 Lt` / `6×1L` | `count_size` | L → ml | 5 | `cx` | `structure_total` 6 L (1 case); `rowQty` ignored | **BROKEN** |
| **Chocolate** `10×200 g` / `10×200g` | `count_size` | g | 2 | `cx` | `structure_total` 2 kg (1 case); `rowQty` ignored | **BROKEN** |
| **Peroni** `33cl×24` | `size_count` | cl → ml | 24 | `un` | `structure_total` 7.92 L; `rowQty === innerCount` | SAFE |
| **Mozzarella** `125GR×8` | `size_count` | g | 10 | `un` | `structure_scaled_outer` 10 kg via g-scaling helper | SAFE (fixed) |
| **Açúcar** `10×1 kg` | `count_size` | kg → g | 1 | `cx` | `structure_total` 10 kg; `rowQty === 1` | SAFE |
| **Pomodori** `2.5kg×6` | `size_count` | kg → g | 1 | `un` | `structure_total` 15 kg; `rowQty === 1` | SAFE |

**Structure totals (one case / one pack):**

- Pellegrino: `15 × 75cl = 11 250 ml`
- Nata: `6 × 1L = 6 000 ml`
- Chocolate: `10 × 200g = 2 000 g`
- Peroni: `24 × 33cl = 7 920 ml`
- Mozzarella: `8 × 125g = 1 000 g`
- Açúcar: `10 × 1kg = 10 000 g`
- Pomodori: `6 × 2.5kg = 15 000 g`

---

## 2. Why SAFE Rows Remain Safe

### Peroni (`size_count`, cl, rowQty=24)

- **Discriminator:** `Math.abs(rowQty - innerUnitCount) < 0.01` → `24 === 24`
- **Effect:** `shouldScaleOuterPackForSizeCountGenericRow` returns `false`; `structureTotalIsFinalForGenericRow` returns `true` (has inner)
- **Semantics:** Invoice qty counts **bottles**, not outer cases; structure total already equals line volume
- **Path:** `usableSource = structure_total`, 7 920 ml unchanged

### Mozzarella (`size_count`, g, rowQty=10)

- **Discriminator:** `shouldScaleOuterPackForSizeCountGenericRow` — g unit, `rowQty > 1`, `rowQty ≠ innerCount` (10 ≠ 8)
- **Effect:** `resolveStructurePurchaseQuantity → 10`; `scaleStructureTotal(1000, 10) → 10 000 g`
- **Path:** `usableSource = structure_scaled_outer` (implemented 2026-06-22)

### Açúcar (`count_size`, kg, rowQty=1)

- **Discriminator:** `rowQty <= 1` — outer scaling gates require `rowQty > 1`
- **Effect:** `structureTotalIsFinalForGenericRow` true for `count_size`; returns 10 kg
- **Path:** `usableSource = structure_total`

### Pomodori (`size_count`, kg, rowQty=1)

- **Discriminator:** Same as Açúcar — `rowQty === 1`
- **Effect:** No outer multiplication; 15 kg correct for one case
- **Path:** `usableSource = structure_total`

---

## 3. Why BROKEN Rows Fail

### Common pipeline (all six broken lines)

```
parsePurchaseStructureFromText → structure (one-case totalUsableAmount)
  → resolveStructurePurchaseQuantity → 1  (rowQty discarded)
  → computeUsableFromPurchaseStructure → structure_total (no outer multiply)
```

### Pellegrino (×2 cases, `size_count`)

| Step | Value | Notes |
|------|-------|-------|
| Parse | tier `size_count`, `innerUnitCount=15`, `totalUsableAmount=11250` ml | `SIZE_COUNT_RE` matches `75CL×15` |
| `shouldScaleOuterPackForSizeCountGenericRow` | `false` | **g-only** guard; `unitMeasurement === 'cl'` |
| `structureTotalIsFinalForGenericRow` | `true` | `hasInner` (15 > 1) |
| `resolveStructurePurchaseQuantity` | **1** | Row qty 2 blocked |
| `computeUsableFromPurchaseStructure` | **11250** ml | `structure_total` branch |
| **Expected** | **22500** ml (2 × 11.25 L) | `rowQty × structure_total` |

**Exact transformation:** `11250 ml` (current) = `1 × 15 × 75cl`; should be `2 × 15 × 75cl = 22500 ml`.

Evidence: `.tmp/pellegrino-root-cause-audit/results.json`, `.tmp/outer-quantity-population-audit/results.json` (`ef25be0f`, `9cdd22ba`).

### Nata (×5 cases, `count_size`)

| Step | Value | Notes |
|------|-------|-------|
| Parse | tier `count_size`, `purchaseQuantity=6`, `totalUsableAmount=6000` ml | `COUNT_SIZE_RE` matches `6×1 Lt` |
| `structureTotalIsFinalForGenericRow` | `true` | **`count_size` tier always final** |
| `resolveStructurePurchaseQuantity` | **1** | Generic `cx` → hardcoded `1` in count_size branch |
| `computeUsableFromPurchaseStructure` | **6000** ml | Scaling branch unreachable (`structureTotalIsFinal` true) |
| **Expected** | **30000** ml (5 × 6 L) | `rowQty × structure_total` |

**Exact transformation:** `6000 ml` = one case; should be `5 × 6000 = 30000 ml`.

Evidence: `2b5cea32`, `fead3fbb` in population audit.

### Chocolate (×2 cases, `count_size`)

| Step | Value | Notes |
|------|-------|-------|
| Parse | tier `count_size`, `purchaseQuantity=10`, `totalUsableAmount=2000` g | `10×200 g` |
| Same gate failure as Nata | `structureTotalIsFinal` blocks `rowQty × total` branch |
| **Current** | **2000** g (2 kg) | One case only |
| **Expected** | **4000** g (4 kg) | `2 × 2000` |

Evidence: `fa0d0138`, `11024922` in population audit.

---

## 4. Design Options

| Option | Scope | Risk | Files |
|--------|-------|------|-------|
| **A) Minimal targeted helpers** | Extend `shouldScaleOuterPackForSizeCountGenericRow` to volume (`cl`, `L`, `ml`); add `shouldScaleOuterCountForCountSizeGenericRow` for `count_size` + case rowUnit + `rowQty > 1` | **Low** | `stock-normalization.ts`, `stock-normalization.test.ts` |
| **B) Family-level gate change** | Add `rowQuantity` param to `structureTotalIsFinalForGenericRow`; return `false` when `rowQty > 1` for `count_size` / `size_count` with inner | **Low–medium** | `stock-normalization.ts` (+ all call sites) |
| **C) Alternative discriminator** | Parse-time outer count from name (`2 caixas × 24×80g` triple-nested); or unify all tiers into one `shouldScaleOuterQuantityForGenericRow` | **Medium–high** | Parser + normalization; broader blast radius |
| **D) Broaden g-scaling to all units** | Remove unit filter from Mozzarella helper | **High** | Breaks Mezzi (`size_count` kg), Guanciale billed-weight path |
| **E) Invoice-format override only** | Multiply in `resolveInvoiceLinePurchaseFormat` | **Medium** | Bypasses normalization contract; UI/cost divergence risk |

---

## 5. Regression Matrix (must-not-regress)

| Product | Tier | RowQty | Current usable | After fix | Guard |
|---------|------|--------|----------------|-----------|-------|
| Mozzarella 125g×8 | `size_count` | 10 | 10 kg | 10 kg | Existing g helper unchanged |
| Peroni 33cl×24 | `size_count` | 24 | 7.92 L | 7.92 L | `rowQty === innerCount` |
| Açúcar 10×1kg | `count_size` | 1 | 10 kg | 10 kg | `rowQty <= 1` |
| Pomodori 2.5kg×6 | `size_count` | 1 | 15 kg | 15 kg | `rowQty <= 1` |
| Ginger Beer 0.20cl | `bare_measure` | 24 | 4.80 L | 4.80 L | Orthogonal tier; `structure_recomputed` |
| Guanciale 1.5kg×7 | `size_count` | 5.996 | ~6 kg | ~6 kg | `shouldUseRowQtyAsBilledKg` fires first (fractional kg) |
| Mezzi 1kg×6 | `size_count` | 2 | 6 kg | 6 kg | **kg excluded** from volume/g outer-scaling |
| Ricotta 1.5kg | `bare_measure` | 2 | 3 kg | 3 kg | Different tier |
| Rulo 1kg×2 | `size_count` | 1 | 2 kg | 2 kg | `rowQty === 1` |
| Aceto 5l×2 | `size_count` | 1 | 10 L | 10 L | `rowQty === 1` |
| `24×80g` row 2 `un` | `count_size` | 2 | 1.92 kg | 1.92 kg | **No case rowUnit** — existing test preserved |

**Known edge (out of scope):** `size_count` `5l×2` with `rowQty=2` equals inner count would not scale (Peroni rule). No VL exemplar; document only.

---

## 6. Expected Results Table

| Product | RowQty | Current | Expected | Δ |
|---------|--------|---------|----------|---|
| Pellegrino 75cl×15 | 2 | 11.25 L | **22.50 L** | ×2 |
| Nata 6×1L | 5 | 6.00 L | **30.00 L** | ×5 |
| Chocolate 10×200g | 2 | 2 kg | **4 kg** | ×2 |

**Operational cost (Emporio Pellegrino):** €3.43/L → **€1.71/L** at €38.56 / 22.5 L.

---

## 7. Readiness Verdict

### **A) Ready for implementation**

| Criterion | Status |
|-----------|--------|
| Root cause localized | Proven — `structureTotalIsFinal` + tier-specific gates |
| VL population evidence | 6 broken lines, shared pattern (`.tmp/outer-quantity-population-audit/`) |
| Mozzarella decoupling | Proven — g-only helper; orthogonal Guanciale kg-billed helper |
| Regression controls | Matrix specified with explicit guards |
| Parser unchanged | `SIZE_COUNT_RE`, `COUNT_SIZE_RE` not implicated |

**Not blocking:** Mezzi/Ricotta ambiguity (Family A) — excluded via kg guard and `bare_measure` tier separation.

---

## Recommended Option A — Detailed Design

### Rationale

1. **Mirrors proven Mozzarella pattern** — same integration points, minimal diff
2. **Partitioned discriminators** avoid Mezzi kg regression and Guanciale billed-weight regression
3. **count_size uses direct multiply** — `scaleStructureTotal` is wrong when `structure.purchaseQuantity` is inner pack count (10, 6), not outer count
4. **Case-unit gate for count_size** preserves `24×80g` + `un` test (row qty ≠ case purchase)

### Helper 1 — Extend volume on `size_count` (Pellegrino)

**Conceptual change to `shouldScaleOuterPackForSizeCountGenericRow`:**

```typescript
// Pseudocode — extend unit allowlist; keep kg excluded
function shouldScaleOuterPackForSizeCountGenericRow(
  structure: PurchaseStructure,
  rowQuantity: number | null,
  rowUnit: string | null,
): boolean {
  if (structure.tier !== "size_count") return false;
  if (!isGenericPurchaseUnit(rowUnit)) return false;
  if (rowQuantity == null || rowQuantity <= 1) return false;
  const inner = structure.innerUnitCount ?? 1;
  if (Math.abs(rowQuantity - inner) < 0.01) return false; // Peroni
  // Guanciale billed-kg handled upstream — must not reach here as scale
  if (structure.unitMeasurement === "kg") return false; // Mezzi guard
  return ["g", "cl", "L", "ml"].includes(structure.unitMeasurement);
}
```

### Helper 2 — New `count_size` outer case scaling (Nata, Chocolate)

```typescript
const CASE_PURCHASE_UNITS = new Set([
  "cx", "caixa", "caixas", "case", "cases", "emb", "embalagem", "embalagens",
]);

function isCasePurchaseUnit(unit: string | null | undefined): boolean {
  const n = unit?.trim().toLowerCase();
  return n != null && CASE_PURCHASE_UNITS.has(n);
}

function shouldScaleOuterCountForCountSizeGenericRow(
  structure: PurchaseStructure,
  rowQuantity: number | null,
  rowUnit: string | null,
): boolean {
  if (structure.tier !== "count_size") return false;
  if (!isCasePurchaseUnit(rowUnit)) return false; // preserves 24×80g + un
  if (rowQuantity == null || rowQuantity <= 1) return false;
  return true;
}
```

### Integration — `resolveStructurePurchaseQuantity`

```typescript
// In count_size branch, before `return 1` for generic:
if (shouldScaleOuterCountForCountSizeGenericRow(structure, rowQuantity, rowUnit)) {
  return Math.max(1, Math.round(rowQuantity));
}

// size_count branch — extend existing shouldScaleOuterPack call (already present)
```

### Integration — `computeUsableFromPurchaseStructure`

```typescript
// size_count inner branch — existing shouldScaleOuterPack path uses scaleStructureTotal ✓

// count_size branch — add BEFORE structure_total fallback:
} else if (shouldScaleOuterCountForCountSizeGenericRow(structure, rowQuantity, rowUnit)) {
  total = Math.max(1, Math.round(rowQuantity!)) * structure.totalUsableAmount;
  usableSource = "structure_scaled_outer";
  fallbackReason = `outer case count ${rowQuantity} × pack total ${structure.totalUsableAmount}`;
}
```

**Order of guards (unchanged priority):**

1. `rowConflatedPurchase` / weak row paths  
2. `shouldUseRowQtyAsBilledKgForSizeCountGenericRow` (Guanciale)  
3. `shouldScaleOuterPackForSizeCountGenericRow` (size_count g/cl/L/ml)  
4. **`shouldScaleOuterCountForCountSizeGenericRow` (count_size cx)** ← new  
5. `structureTotalIsFinalForGenericRow` fallback  

### Tests to add/update (`stock-normalization.test.ts`)

Follow existing `describe("size_count outer-pack scaling — Mozzarella fix")` pattern:

| Case | Input | Expected usable | Expected source |
|------|-------|-----------------|-----------------|
| Pellegrino Boc | `ACQUA S.PELLEGRINO (CX 75CL*15)`, qty=2, un | 22500 ml | `structure_scaled_outer` |
| Pellegrino Emp | `SanPellegrino - Acqua in vitro 75cl x 15ud`, qty=2, un | 22500 ml | `structure_scaled_outer` |
| Nata | `Nata Culinaria 22% Reny Picot 6x1 Lt`, qty=5, cx | 30000 ml | `structure_scaled_outer` |
| Chocolate | `Chocolate Culinaria Pantagruel 10x200 g`, qty=2, cx | 4000 g | `structure_scaled_outer` |
| Peroni | qty=24 | 7920 ml | `structure_total` (unchanged) |
| Açúcar | qty=1, cx | 10000 g | `structure_total` (unchanged) |
| `24×80g` | qty=2, un | 1920 g | `structure_total` (unchanged) |

Update Pellegrino expectations in Mozzarella describe block from 11250 → 22500.

### Blast radius expectation

Population audit: **6 lines change** (all currently BROKEN); **11 SAFE unchanged**; Mozzarella/Guanciale helpers untouched.

---

## Evidence Sources

| Artifact | Role |
|----------|------|
| `.tmp/outer-quantity-population-audit/results.json` | VL scan; 6 BROKEN, family hypothesis |
| `.tmp/pellegrino-root-cause-audit/results.json` | Stage-by-stage trace; first incorrect = stock-normalization |
| `.tmp/mozzarella-implementation-validation/results.json` | Mozzarella fix blast radius; Pellegrino intentionally unchanged pre-this-fix |
| `.tmp/guanciale-fix-design/design.json` | kg billed-weight orthogonal helper |
| `.tmp/size-count-discriminator-audit/discriminator.json` | Peroni vs Pellegrino partition |
| `src/lib/stock-normalization.ts` L1092–1348 | Gate functions |
| `src/lib/stock-normalization.test.ts` L803–974 | Test patterns |

---

## Confidence

| Dimension | Score |
|-----------|-------|
| Root cause | 0.95 |
| Option A safety (regression guards) | 0.88 |
| VL broken-line coverage | 0.94 |
| count_size `un` edge cases | 0.75 (documented, not in VL broken set) |
| **Overall** | **0.90** |
