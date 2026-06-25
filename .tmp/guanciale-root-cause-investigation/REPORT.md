# Guanciale Root Cause Investigation

**VL:** `bjhnlrgodcqoyzddbpbd`  
**Mode:** READ-ONLY  
**Classification: B** — Operational normalization incorrectly prefers package weight over billed quantity.

---

## One-sentence explanation

The name `1,5kg*7` is correctly parsed as a 7×1.5 kg case (10.5 kg), but `computeUsableFromPurchaseStructure` treats that structure total as the final usable weight for generic `un` rows instead of recognizing that the fractional row quantity (5.996) is billed kilograms, producing €6.18/kg instead of €10.83/kg.

---

## Function + file:line

| Role | Function | Location |
|------|----------|----------|
| **Primary bug (pre-fix path)** | `computeUsableFromPurchaseStructure` | `src/lib/stock-normalization.ts:1409–1420` |
| **Policy gate that enables it** | `structureTotalIsFinalForGenericRow` | `src/lib/stock-normalization.ts:1127–1140` |
| **Where 10.5 kg is computed** | `buildStructure` (`1 × 7 × 1500 g`) | `src/lib/stock-normalization.ts:604–607` |
| **Parser (correct, not the bug)** | `parsePurchaseStructureFromText` → `SIZE_COUNT_RE` | `src/lib/stock-normalization.ts:760–778` |
| **Why the finding fires** | `detectPackStructureInvoiceWeightMismatch` | `src/lib/invoice-validation/validators/operational.ts:138–219` |

---

## Stage trace

### 1. OCR extraction — correct

| Field | Value |
|-------|-------|
| quantity | 5.996 |
| unit | `un` (PDF `UN`) |
| unit_price | €10.83 net |
| total | €64.93 |
| pack notation | `+/- 1,5kg*7` in name |

### 2. Pass C / structured purchase format

`SIZE_COUNT_RE` match on `1,5kg*7` → tier `size_count`, innerUnitCount 7, unitSize 1.5 kg, totalUsableAmount 10 500 g.

### 3. `invoice_items` row

| Field | Value |
|-------|-------|
| quantity | 5.996 |
| unit | `un` |
| unit_price | 10.83 |
| total | 64.93 |

Row math is internally consistent (`5.996 × €10.83 ≈ €64.93`).

### 4. Operational normalization — where 10.5 kg is chosen

```
resolveInvoiceLinePurchaseFormat
 → normalizePurchasedToUsableStock
 → parsePurchaseStructureFromText → totalUsableAmount=10500
 → computeUsableFromPurchaseStructure(structure, 5.996, "un")
 → structureTotalIsFinalForGenericRow → true (innerUnitCount=7 > 1)
 → usableQuantity = 10500 g (structure_total)
```

**€/kg math:**
- Invoice-implied: `€64.93 ÷ 5.996 kg = €10.83/kg`
- Wrong operational: `€64.93 ÷ 10.5 kg = €6.18/kg`

### 5. Decision point

| Option | Verdict |
|--------|---------|
| A) Package parser wrong | ✗ — parser correct |
| **B) Normalization prefers package weight** | **✓** |
| C) Invoice row ambiguous | Partial — PDF says `UN` but math proves kg semantics |
| D) Something else | ✗ |

---

## Smallest fix (do not implement here)

Use existing `shouldUseRowQtyAsBilledKgForSizeCountGenericRow` guard in `computeUsableFromPurchaseStructure` before `structureTotalIsFinalForGenericRow` branch (`stock-normalization.ts:1401–1404`).

Post-fix: usable 10.5 kg → ~6.0 kg, operational cost €6.18/kg → €10.83/kg.

**Note:** Validator may still fire at `quantity: 1` resolution even after fix — would need to skip rows where `usableSource === "row_weight_billed"`.

**VL follow-up:** Re-ingest invoice so catalog reflects corrected 5996 g usable weight.
