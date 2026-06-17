# Unit Parsing Trace — `0.20cl`

---

## Parser: `detectVolume` (`ingredient-unit-inference.ts`)

```typescript
{ re: /(\d+(?:[.,]\d+)?)\s*CL\b/g, toMl: (n) => n * 10, label: "CL" }
```

On `"Baladin - Ginger Beer 0.20cl"`:

1. Normalize → `"BALADIN - GINGER BEER 0.20CL"`
2. CL regex matches `0.20CL` → `parseQuantityToken("0.20")` = **0.2**
3. `toMl(0.2)` = **0.2 × 10 = 2 ml**
4. `Math.max(1, Math.round(2))` = **2 ml**

Parallel path: `stock-normalization.ts` `parseSizeAndUnit` — `cl` × 10 → ml → **2 ml**.

---

## Options A–E

| Option | Interpretation | Verdict |
|--------|----------------|---------|
| A | Source document contains literal `0.20cl` | **YES — first appearance** |
| B | OCR introduced it | **NO** — Pass D copies visible text |
| C | GPT invented it | **NO** — re-invokes return same string |
| D | `normalizeItems()` transformed it | **NO** — pass-through |
| E | Parser reads as **2 ml** (0.20 CL × 10) | **YES** — not 20cl, 0.20L, or 200ml |

SKU `BBB-GINGER33ITA` implies **33cl**; Designação column prints `0.20cl` — mismatch on supplier document.

`repairDecimalClBeverageVolume` referenced in fix-validation scripts but **not in current** `ingredient-unit-inference.ts`.
