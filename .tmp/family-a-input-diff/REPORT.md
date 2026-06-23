# Family A Input Diff — Pass C vs Hybrid H

**Generated:** 2026-06-22  
**Mode:** STRICT READ-ONLY  
**Validation Lab:** `bjhnlrgodcqoyzddbpbd`  
**Invoice:** `f0aa5a08-86a3-4938-99f0-711e86073968` (IL Bocconcino, 2026-05-08)  
**Scope:** Pass C baseline → Hybrid H table GPT boundary. No procurement, costs, UI, persistence, fixes.

**Artifact gap:** No archived Hybrid H structured GPT raw JSON for the bad path (`artifact-index.json`: `v25HybridHRawGptCapture: none`). Hybrid H structured fields inferred from API output + production replay; quantity attribution relies on downstream qty-invariant proof.

---

## Pass C Input

### GPT call envelope (both rows)

| Dimension | Value |
|-----------|-------|
| Model | `gpt-4.1` (`OPENAI_OCR_MODEL`) |
| Temperature / seed | `0` / `42` |
| System prompt | `TABLE_EXTRACTION_SYSTEM_PROMPT` ~125 lines (`.tmp/passc-prompt-audit/passc-prompt.txt`) |
| User message | `Extract all invoice line items from this restaurant invoice table image.` |
| Image | 5-row table crop (pre `2edcd02`; Mozzarella + Stracciatella excluded — `.tmp/bocconcino-investigation/REPORT.md`) |
| Response schema | Legacy `{ name, quantity, unit, unit_price, total }` via `json_object` |
| Supplier in prompt | **No** — supplier extracted in separate pass; not passed to table GPT (`index.ts`) |
| Footer total in prompt | **No** |

### RICOTTA TREVIGIANA 1,5KG — Pass C structured row

| Field | Value |
|-------|-------|
| description | `RICOTTA TREVIGIANA 1,5KG` |
| quantity | **1** |
| CX / CXs | blank on invoice (not in GPT schema) |
| unit | `uni` |
| unit_price | 7.97 |
| total | 7.97 |
| discount | blank DESC (not emitted) |
| OCR text (visible) | QUANT=1,000 · CXs=0 · UNI · P.VENDA=7,967 EUR · DESC blank · VALOR LÍQUIDO=7,97 EUR |
| neighbouring rows (5-row crop) | above: ACQUA qty=2; below: ROLO qty=1 |
| row position | 4 of 5 |
| Sources | `pass-c-raw/...-gpt-raw-cache.json`, `passc-refinement-validation/reextract/...`, `bocconcino-investigation/extract-invoice-response.json` |

### MEZZI PACCHERI MANCINI (CX 1KG*6) — Pass C structured row

| Field | Value |
|-------|-------|
| description | `MEZZI PACCHERI MANCINI (CX 1KG*6)` |
| quantity | **1** |
| CX / CXs | blank on invoice |
| unit | `uni` |
| unit_price | 27.56 |
| total | 27.30 |
| discount | blank DESC |
| OCR text (visible) | QUANT=1,000 · CXs blank · UNI · P.VENDA=27,300 EUR · DESC blank · VALOR LÍQUIDO=27,30 EUR |
| neighbouring rows (5-row crop) | first complete row in crop; below: POMODORI qty=1 |
| row position | 1 of 5 |
| Sources | same as Ricotta |

### Pass C hidden prompt context (relevant to qty)

- `But DO infer quantity/unit when clearly present inside product names` (passc-prompt.txt L31)
- Pack-count examples: `"Coca-Cola 33cl Pack 24" → quantity: 24` (L51–54)
- No explicit `CX 1KG*6` or `1,5KG` negative examples
- No `PACK NOTATION IS METADATA` section

---

## Hybrid H Input

### GPT call envelope (both rows)

| Dimension | Value |
|-----------|-------|
| Model | `gpt-4.1` (unchanged) |
| Temperature / seed | `0` / `42` (unchanged) |
| System prompt | `TABLE_EXTRACTION_SYSTEM_PROMPT` ~250 lines (`invoice-table-extraction.ts` L18–255) |
| User message | `Extract each visible invoice line item. Copy quantity, gross_unit_price, discount_pct, and line_total_net from their labeled table columns.` |
| Image | 7-row table crop (post `2edcd02`; all rows visible — `.tmp/hallucination-audit/REPORT.md`) |
| Response schema | Strict `json_schema`: `{ name, quantity, unit, gross_unit_price, discount_pct, line_total_net }` |
| Supplier in prompt | **No** |
| Footer total in prompt | **No** (`knownTotal` used only for empty-table full-image retry) |

### RICOTTA TREVIGIANA 1,5KG — Hybrid H structured row (inferred)

| Field | Value |
|-------|-------|
| description | `RICOTTA TREVIGIANA 1,5KG` |
| quantity | **2** |
| CX / CXs | blank on invoice |
| unit | `uni` |
| gross_unit_price | null (structured bleed to legacy) |
| discount_pct | null |
| line_total_net | null |
| unit_price (API) | 7.967 |
| total | 7.97 |
| OCR text (visible) | **Same as PDF** — QUANT=1,000 · blank DESC · 7,967 · 7,97 |
| neighbouring rows (7-row crop) | above: ACQUA qty=2; below: ROLO qty=1 |
| row position | 6 of 7 |
| stability | qty=2 in **10/10** runs |
| Sources | `final-validation-lab-rerun/extracts/...`, `final-stability-audit/...-all-runs.json` |

### MEZZI PACCHERI MANCINI (CX 1KG*6) — Hybrid H structured row (inferred)

| Field | Value |
|-------|-------|
| description | `MEZZI PACCHERI MANCINI (CX 1KG*6)` |
| quantity | **2** |
| CX / CXs | blank on invoice |
| unit | `uni` |
| gross_unit_price | null |
| discount_pct | null |
| line_total_net | null |
| unit_price (API) | 27.36 |
| total | 27.30 |
| OCR text (visible) | **Same as PDF** — QUANT=1,000 · blank DESC · 27,300 · 27,30 |
| neighbouring rows (7-row crop) | above: MOZZARELLA qty=10, STRACCIATELLA qty=24; below: POMODORI qty=1 |
| row position | 3 of 7 |
| stability | qty=2 in **10/10** runs |
| Sources | same as Ricotta |

### Hybrid H hidden prompt context (relevant to qty)

- `PACK NOTATION IN DESCRIPTIONS IS METADATA` — `*6`, `1kg*2`, `(CX 2.5KG*6)` not purchased qty (L65–67)
- `When quantity column AND description disagree → ALWAYS trust the quantity column` (L69)
- Negative: `"POMODORI PELATI (CX 2,5KG*6)" qty 1,000 → quantity: 1 (NOT 6)` (L131–135)
- `FRACTIONAL QUANTITIES` — copy 1,5 exactly (L118–125)
- Post-GPT: `bindMonetaryColumns` (not in GPT prompt; does not modify quantity)

---

## Input Differences

### RICOTTA — field-by-field

| Field | Pass C | Hybrid H | Same? |
|-------|--------|----------|-------|
| description | RICOTTA TREVIGIANA 1,5KG | RICOTTA TREVIGIANA 1,5KG | **Yes** |
| quantity | 1 | 2 | **No** |
| CX / CXs | blank | blank | Yes |
| unit | uni | uni | Yes |
| unit price | 7.97 | 7.967 (gross null) | ~Yes (PDF 7.967) |
| total | 7.97 | 7.97 | **Yes** |
| discount | blank | null | Yes |
| OCR text | QUANT=1,000 · blank DESC · 7,967 · 7,97 | identical | **Yes** |
| row context | 4/5 in 5-row crop | 6/7 in 7-row crop | **No** |
| neighbouring rows | Acqua(2), Rolo(1) | Acqua(2), Rolo(1) | Yes (same adjacents) |
| supplier metadata | not in prompt | not in prompt | Yes |
| hidden prompt context | legacy infer-from-name; no 1,5KG negative | column-faithful; fractional rule; pack-metadata | **No** |
| table crop image | 5-row | 7-row | **No** |
| response schema | unit_price/total | gross/discount/net | **No** |

### MEZZI — field-by-field

| Field | Pass C | Hybrid H | Same? |
|-------|--------|----------|-------|
| description | MEZZI PACCHERI MANCINI (CX 1KG*6) | MEZZI PACCHERI MANCINI (CX 1KG*6) | **Yes** |
| quantity | 1 | 2 | **No** |
| CX / CXs | blank | blank | Yes |
| unit | uni | uni | Yes |
| unit price | 27.56 | 27.36 (gross null) | ~Yes (PDF 27.30) |
| total | 27.30 | 27.30 | **Yes** |
| discount | blank | null | Yes |
| OCR text | QUANT=1,000 · blank DESC · 27,300 · 27,30 | identical | **Yes** |
| row context | 1/5, first complete row | 3/7, after Mozzarella(10)+Stracciatella(24) | **No** |
| neighbouring rows | POMODORI(1) only above in crop | Mozzarella(10), Stracciatella(24), POMODORI(1) | **No** |
| supplier metadata | not in prompt | not in prompt | Yes |
| hidden prompt context | legacy pack-inference; no CX+*N negative | POMODORI *6 negative; PACK METADATA rule | **No** |
| table crop image | 5-row | 7-row | **No** |
| response schema | unit_price/total | gross/discount/net | **No** |

**Summary:** For both Family A rows, PDF/OCR column values are identical across eras. The sole row-field divergence is **quantity (1 vs 2)**. GPT-call envelope differs in **crop image, system prompt, user message, and response schema**. Model is unchanged.

---

## GPT Path Comparison

| Dimension | Pass C | Hybrid H |
|-----------|--------|----------|
| Code path | `runTableExtractionPass` → `callOpenAiJson` | same function |
| Prompt source | `TABLE_EXTRACTION_SYSTEM_PROMPT` (pre-Hybrid snapshot) | `TABLE_EXTRACTION_SYSTEM_PROMPT` (current `invoice-table-extraction.ts`) |
| Prompt length | ~125 lines | ~250 lines |
| Model | gpt-4.1 | gpt-4.1 |
| Output schema | `{ name, quantity, unit, unit_price, total }` | `{ name, quantity, unit, gross_unit_price, discount_pct, line_total_net }` |
| Schema enforcement | `json_object` | `json_schema` strict |
| User message | Extract **all** line items | Copy qty/gross/discount/net from **labeled columns** |
| Post-GPT | `reconcileLineItemAmounts` | `parseMonetaryLineItems` → `bindMonetaryColumns` → `reconcileLineItemAmounts` |
| Supplier pass | Separate (not fed to table GPT) | Same |
| Qty author | GPT table pass only | GPT table pass only |

**Exact prompt deltas affecting qty semantics:**

| Pass C (absent or opposite) | Hybrid H (present) |
|-----------------------------|-------------------|
| Infer qty from product names when "clearly present" | Descriptions NEVER override table quantities (L59) |
| Pack 24 → qty 24 examples | PACK NOTATION IS METADATA (L65–67) |
| No CX+*N negative | POMODORI `(CX 2,5KG*6)` → qty 1 NOT 6 (L131–135) |
| No fractional rule | Copy 1,5 / 0,5 exactly (L118–125) |
| unit_price + total authoritative | gross_unit_price + discount_pct + line_total_net |

---

## Family A Signals

Signals visible to Hybrid H that **could** imply qty=2 for Ricotta/Mezzi. Evidence only.

### RICOTTA TREVIGIANA 1,5KG

| Signal | Could imply qty=2? | Evidence |
|--------|-------------------|----------|
| `1,5KG` decimal weight in description | **Yes** | `decimal_weight_1,5KG` cluster (`family-a-scope-audit`); no `*N` multiplier |
| blank DESC (undiscounted) | Indirect | unit≈total at qty=1; no discount anchor |
| unit_price ≈ total (7.967 ≈ 7.97) | **Yes** | Signature: total preserved when qty doubled; binder halves unit |
| blank CXs | No | Shared with Pomodori/Rolo |
| QUANT column 1,000 | **No** | PDF + Pass C both read 1 |
| Neighbour Acqua qty=2 | No | Legitimate PDF QUANT=2,000 (control) |
| Prompt fractional rule (1,5) | **No** | Rule says copy 1.5 from column, not inflate to 2 |
| Supplier IL BOCCONCINO | No | Not in table GPT prompt |

### MEZZI PACCHERI MANCINI (CX 1KG*6)

| Signal | Could imply qty=2? | Evidence |
|--------|-------------------|----------|
| `(CX 1KG*6)` pack notation | **Yes** | `CX+*N`, `pack_multiplier` clusters; `*6` = units-per-case |
| blank DESC | Indirect | Same undiscounted pattern as Ricotta |
| unit_price ≈ total (27.36 ≈ 27.30) | **Yes** | Total-preservation signature |
| blank CXs despite (CX ...) in name | Ambiguous | CXs column empty |
| QUANT column 1,000 | **No** | PDF ground truth |
| Neighbours Mozzarella qty=10, Stracciatella qty=24 | Weak | Only in 7-row Hybrid H crop |
| Prompt POMODORI *6 → qty 1 | **No** | Guardrail exists; Mezzi still qty=2 |
| `*2` in description (cf. Mammafiore controls) | No | Mezzi has `*6`, not `*2` |

---

## Control Comparison

Same invoice (`f0aa5a08`), same Hybrid H pipeline era.

| Product | Pass C qty | Hybrid H qty | Family A? | Shared signals with Ricotta/Mezzi | Unique differentiator |
|---------|------------|--------------|-----------|-----------------------------------|----------------------|
| POMODORI PELATI (CX 2,5KG*6) | 1 | 1 | No | CX+*N, blank CXs, same crop/prompt | **DESC 20%**; prompt negative example; discounted total≠gross |
| ROLO DE CABRA E VACA 1KG | 1 | 1 | No | weight token, blank DESC, undiscounted | **No *N pack multiplier**; 9/10 stable qty=1 |
| ACQUA S.PELLEGRINO (CX 75CL*15) | 2 | 2 | No | CX+*N in description, IL BOCCONCINO | **PDF QUANT=2,000** — true multi-qty, not inflation |

**Minimum separating combo** (from `family-a-scope-audit`):

1. OCR/Pass C qty = 1  
2. Hybrid H qty = 2 (stable 10/10)  
3. Undiscounted blank DESC  
4. unit_price ≈ total at qty=1  
5. Supplier IL BOCCONCINO  

Pomodori shares (1)(3)(5) and CX+*N but fails (2) because DESC 20% present. Rolo shares (1)(3)(4)(5) but fails (2). Acqua fails (1) — PDF qty is genuinely 2.

---

## Boundary Assessment

**Choice: A) Different input**

| Option | Verdict | Evidence |
|--------|---------|----------|
| A) Different input | **Selected** | Crop 5→7 rows; prompt ~125→~250 lines; user message changed; schema legacy→structured |
| B) Same input different prompt/model | Rejected | Model same, but crop image and neighbour context differ — not same input |
| C) Qty altered before GPT | **Eliminated** | No pre-GPT qty assignment in code; crop is image-only |
| D) Qty altered after GPT | **Eliminated** | `parseMonetaryLineItems`, `bindMonetaryColumns`, `reconcileLineItemAmounts`, `finalizeExtractedLineItems` preserve quantity (production replay; `family-a-transition-trace/trace.json`) |

**First qty deviation:** Pass C baseline qty=1 → Hybrid H API qty=2. Downstream stages preserve qty=2 unchanged.

**Caveat:** Pomodori/Rolo/Acqua share the Hybrid H input envelope but do not show 1→2 inflation — input delta alone is necessary but not sufficient; GPT table pass is the quantity author.

---

## Confidence

| Claim | Confidence |
|-------|------------|
| PDF/OCR QUANT=1,000 for Ricotta and Mezzi | 0.97 |
| Pass C emits qty=1 (gpt-raw + reextract + cropped invoke) | 0.97 |
| Hybrid H API emits qty=2 stable 10/10 | 0.97 |
| Downstream does not modify quantity | 0.97 |
| GPT-call input differs between eras (crop + prompt + schema) | 0.95 |
| Hybrid H raw structured GPT JSON had qty=2 | 0.78 (inferred; no archived capture) |
| Boundary = different input (not post-GPT mutation) | 0.88 |

---

## Sources

- `.tmp/passc-refinement-validation/reextract/f0aa5a08-86a3-4938-99f0-711e86073968.json`
- `.tmp/persistence-audit/pass-c-raw/f0aa5a08-86a3-4938-99f0-711e86073968-gpt-raw-cache.json`
- `.tmp/final-validation-lab-rerun/extracts/f0aa5a08-86a3-4938-99f0-711e86073968.json`
- `.tmp/family-a-transition-trace/trace.json`
- `.tmp/family-a-v25-raw-capture/artifact-index.json`
- `.tmp/family-a-v25-raw-capture/edge-invoke-final.json`
- `.tmp/family-a-scope-audit/audit-result.json`
- `.tmp/ricotta-root-cause-trace/trace.json`
- `.tmp/mezzi-root-cause-trace/trace.json`
- `.tmp/bocconcino-investigation/extract-invoice-response.json`
- `.tmp/passc-prompt-audit/passc-prompt.txt`
- `supabase/functions/extract-invoice/invoice-table-extraction.ts`
- `supabase/functions/extract-invoice/index.ts`

Machine-readable: `.tmp/family-a-input-diff/diff.json`
