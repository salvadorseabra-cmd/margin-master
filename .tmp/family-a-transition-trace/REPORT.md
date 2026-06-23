# Family A — Pass C → Hybrid H Transition Trace

**Generated:** 2026-06-22  
**Mode:** STRICT READ-ONLY  
**Validation Lab:** `bjhnlrgodcqoyzddbpbd`  
**Invoice:** `f0aa5a08-86a3-4938-99f0-711e86073968` (Il Bocconcino, 2026-05-08)  
**Scope:** Pass C baseline → Hybrid H boundary only. No procurement, costs, usable stock, ingredient UI, persistence, Option C, or downstream systems.

---

## Terminology

| Label | Meaning in this trace |
|-------|----------------------|
| **Pass C (baseline)** | Pre-Hybrid table GPT era: legacy schema `{name, quantity, unit, unit_price, total}`. Frozen in `passc-refinement-validation/reextract/` (2026-06-11) and `persistence-audit/pass-c-raw/`. |
| **Hybrid H** | Current table pass in `invoice-table-extraction.ts`: structured GPT schema + `bindMonetaryColumns` + reconcile. Deploy v25+ (`final-validation-lab-rerun`). |
| **Boundary** | This is a **deployment/version transition**, not two sequential stages inside one `extract-invoice` call. A single Hybrid H invoke runs one table GPT pass (index.ts “Pass D”). |

---

### Pass C → Hybrid H Flow

#### RICOTTA TREVIGIANA 1,5KG

| Stage | Source | Quantity | Unit price | Total |
|-------|--------|----------:|-----------:|------:|
| PDF reality | geometry-audit PNG | **1** | 7.967 | 7.97 |
| Pass C GPT raw cache | `pass-c-raw/...-gpt-raw-cache.json` | **1** | 7.97 | 7.97 |
| Pass C baseline reextract | `passc-refinement-validation/reextract/...` | **1** | 7.97 | 7.97 |
| Pass C era cropped invoke | `bocconcino-investigation/extract-invoice-response.json` | **1** | 7.967 | 7.97 |
| Hybrid H GPT raw (structured) | **MISSING** — no bad-path capture | **2** (inferred) | ~7.967 | 7.97 |
| `parseMonetaryLineItems` | production replay | **2** | 7.967 | 7.97 |
| `bindMonetaryColumns` | production replay | **2** | **3.99** | 7.97 |
| `reconcileLineItemAmounts` | production replay | **2** | 3.99 | 7.97 |
| `finalizeExtractedLineItems` | `final-validation-lab-rerun/extracts/...` v25 | **2** | 7.967* | 7.97 |

\*v25 artifact exposes pre-bind unit_price; v36 edge invoke (`.tmp/family-a-v25-raw-capture/edge-invoke-final.json`) shows post-bind **3.99**.

**Pass C raw JSON (actual):**
```json
{
  "name": "RICOTTA TREVIGIANA 1,5KG",
  "quantity": 1,
  "unit": "un",
  "unit_price": 7.97,
  "total": 7.97
}
```

**Hybrid H API output (actual, v25):**
```json
{
  "name": "RICOTTA TREVIGIANA 1,5KG",
  "quantity": 2,
  "unit": "uni",
  "unit_price": 7.967,
  "total": 7.97
}
```

**First deviation:** quantity **1 → 2** between Pass C baseline and Hybrid H table GPT output. All deterministic post-GPT stages preserve `quantity: 2`.

---

#### MEZZI PACCHERI MANCINI (CX 1KG*6)

| Stage | Source | Quantity | Unit price | Total |
|-------|--------|----------:|-----------:|------:|
| PDF reality | geometry-audit PNG | **1** | 27.30 | 27.30 |
| Pass C GPT raw cache | `pass-c-raw/...-gpt-raw-cache.json` | **1** | 27.56 | 27.30 |
| Pass C baseline reextract | `passc-refinement-validation/reextract/...` | **1** | 27.56 | 27.30 |
| Pass C era cropped invoke | `bocconcino-investigation/...` (5-row crop) | **1** | 27.30 | 27.30 |
| Hybrid H GPT raw (structured) | **MISSING** | **2** (inferred) | ~27.36 | 27.30 |
| `parseMonetaryLineItems` | production replay | **2** | 27.36 | 27.30 |
| `bindMonetaryColumns` | production replay | **2** | **13.65** | 27.30 |
| `reconcileLineItemAmounts` | production replay | **2** | 13.65 | 27.30 |
| `finalizeExtractedLineItems` | `final-validation-lab-rerun/extracts/...` v25 | **2** | 27.36* | 27.30 |

**Pass C raw JSON (actual):**
```json
{
  "name": "MEZZI PACCHERI MANCINI (CX 1KG*6)",
  "quantity": 1,
  "unit": "un",
  "unit_price": 27.56,
  "total": 27.3
}
```

**Hybrid H API output (actual, v25):**
```json
{
  "name": "MEZZI PACCHERI MANCINI (CX 1KG*6)",
  "quantity": 2,
  "unit": "uni",
  "unit_price": 27.36,
  "total": 27.3
}
```

**Stability:** Ricotta and Mezzi both **qty=2 in 10/10** runs (`.tmp/final-stability-audit/extracts/f0aa5a08-...-all-runs.json`).

---

#### Code path (invoice-table-extraction.ts → index.ts)

Pipeline order inside `runTableExtractionPass`:

```
cropTableRegionForLineItems
  → callOpenAiJson (TABLE_EXTRACTION_SYSTEM_PROMPT + structured schema)  ← qty authored
  → parseMonetaryLineItems
  → bindMonetaryColumns
  → monetaryToInvoiceLineItem
  → reconcileLineItemAmounts
```

Then in `index.ts`:
```
extractTableItemsFromImage → finalizeExtractedLineItems (net-subtotal reconcile)
```

| Function | Input Qty | Output Qty | Can modify qty? |
|----------|----------:|-----------:|:---------------:|
| `extractTableItemsFromImage` | — | from pass | No |
| `cropTableRegionForLineItems` | — | — | No (image only) |
| `callOpenAiJson` (table GPT) | — | GPT-emitted | **Yes** |
| `parseMonetaryLineItems` | q | q | No |
| `applyStructuredBinding` | q | q | No |
| `bindRow` / `applyEffectivePaidPrice` | q | q | No (unit_price only) |
| `monetaryToInvoiceLineItem` | q | q | No |
| `reconcileLineItemAmounts` | q | q | No† |
| `reconcileLineItemsToNetSubtotal` | q | q | No‡ |
| `finalizeExtractedLineItems` | q | q | No |

† Skips rows where both `unit_price` and `total` are present (Family A rows).  
‡ Only touches rows with `quantity === 1` and sub-€10 OCR-gap pattern.

---

### Quantity Mutation Locations

Full extract-pipeline search (`supabase/functions/extract-invoice/`):

| Location | File | Mechanism | Modifies qty? |
|----------|------|-----------|:-------------:|
| Table GPT vision pass | `invoice-table-extraction.ts` L383-399 | GPT reads QUANT column / may infer from description | **YES** |
| `parseMonetaryLineItems` | `invoice-monetary-binding.ts` L35 | `typeof row.quantity === "number" ? row.quantity : null` | No |
| `applyStructuredBinding` | `invoice-monetary-binding.ts` L57-86 | Derives `total` from `unit_price × qty` when total missing | No (qty unchanged) |
| `applyEffectivePaidPrice` | `invoice-monetary-binding.ts` L120-130 | `unit_price = total ÷ qty` | No |
| `rebindFromStructured` | `invoice-monetary-binding.ts` L163-182 | `unit_price = line_total_net ÷ qty` | No |
| `reconcileLineItemAmounts` | `invoice-line-reconcile.ts` L68-85 | Fills missing price fields | No |
| `reconcileLineItemsToNetSubtotal` | `invoice-line-reconcile.ts` L27-60 | OCR-gap unit_price fix | No (requires qty=1) |
| `parseContinente` / `parsePadaria` | separate modules | Regex qty extraction | **Not invoked** (index.ts L69) |
| Client `normalizeInvoiceItemFields` | `invoices.tsx` | Name cleanup only | No (out of scope) |

**Between Pass C baseline and Hybrid H API output:** only the **table GPT pass** can explain qty 1→2. Production replay on frozen v25 rows confirms `normalize → bind → reconcile → finalize` all preserve qty=2.

---

### Hybrid H Mechanics

| Question | Answer | Evidence |
|----------|--------|----------|
| Does Hybrid H re-run GPT? | **Yes** — one `callOpenAiJson` per table extraction | `invoice-table-extraction.ts` L383-399 |
| Merge multiple passes? | **No** | Single GPT response consumed |
| Choose candidates? | **No** | No selection/scoring code |
| Score rows? | **No** | — |
| Synthesize qty? | **No** in code | Qty comes from GPT JSON `quantity` field |
| Post-process qty? | **No** | Binding/reconcile preserve quantity |

**What changed from Pass C era to Hybrid H:**

1. **Prompt** — column-faithful `TABLE_EXTRACTION_SYSTEM_PROMPT` (~250 lines) with pack-notation rules (L65-67, L131-135).
2. **Schema** — structured `{gross_unit_price, discount_pct, line_total_net}` vs legacy `{unit_price, total}`.
3. **Binder** — `bindMonetaryColumns` (Phase 3) after GPT; does not touch quantity.
4. **Crop geometry** — full 7-row table post commit `2edcd02` (was 5/7 rows pre-fix per `hallucination-audit/REPORT.md`).

**Artifact gap:** `.tmp/family-a-v25-raw-capture/artifact-index.json` documents **no archived Hybrid H structured GPT raw JSON** for the bad path. `capture-hybrid-h.deno.ts` can capture it but `gpt-raw-json.json` / `stage-trace.json` were not run. Inference: bad-path GPT raw `quantity` = 2 (because all post-GPT stages are qty-invariant and API output is qty=2 before binding collapses unit_price).

---

### Family A Differential

Bocconcino invoice — comparison of pack-metadata rows:

| Product | Pass C Qty | Hybrid H Qty | Family A? | What Hybrid H sees differently |
|---------|----------:|-------------:|:---------:|----------------------------------|
| **RICOTTA TREVIGIANA 1,5KG** | 1 | **2** | **YES** | `decimal_weight_1,5KG` + `weight_token`; undiscounted blank DESC; unit≈total at qty=1 |
| **MEZZI PACCHERI MANCINI (CX 1KG*6)** | 1 | **2** | **YES** | `CX+*N` + `pack_multiplier`; undiscounted blank DESC; unit≈total at qty=1 |
| POMODORI PELATI (CX 2,5KG*6) | 1 | 1 | No | **Has DESC 20%** discount; prompt negative example L131-135; total≠gross unit |
| ROLO DE CABRA E VACA 1KG | 1 | 1 | No | Weight token only; **no `*N` pack multiplier**; same undiscounted profile otherwise |
| ACQUA S.PELLEGRINO (CX 75CL*15) | 2 | 2 | No | **PDF QUANT=2** — true multi-qty, not 1→2 inflation |

**Minimum separating combination** (from `family-a-scope-audit`): Pass C qty=1 AND Hybrid H qty=2 (stable) AND undiscounted blank DESC AND unit≈total at qty=1 AND supplier IL BOCCONCINO.

Only Ricotta and Mezzi satisfy all gates. Pomodori shares pack notation but has discount; Rolo lacks pack multiplier; Acqua has true qty=2.

---

### Remaining Candidates

| Candidate | Supported? | Contradicted? |
|-----------|:----------:|:-------------:|
| **GPT table pass emits qty=2** (pack-metadata conflation: `1,5KG`, `*6`) | ✅ Pass C qty=1 everywhere; Hybrid H qty=2 stable 10/10; totals match PDF at qty=1 | — |
| **bindMonetaryColumns inflates qty** | — | ✅ Code never assigns `quantity`; replay invariant |
| **reconcile / finalize inflates qty** | — | ✅ Family A rows have both price fields; net-subtotal rule requires qty=1 |
| **Crop geometry 5→7 rows causes qty=2** | ⚠️ Pass C 5-row era had qty=1; post-fix 7-row path has qty=2 | ⚠️ Pomodori/Rolo/Acqua also on 7-row crop with correct qty |
| **Structured schema causes qty=2** | ⚠️ Correlates with Hybrid H deploy | ⚠️ Same pipeline yields qty=1 for Pomodori |
| **Hybrid H merges/scores/synthesizes** | — | ✅ No such code paths |
| **Bad-path GPT raw qty=2** | ⚠️ Inferred from downstream invariant | ⚠️ No archived structured GPT JSON for bad path |

---

### Elimination Table

| Stage | Verdict | Rationale |
|-------|---------|-----------|
| Deterministic OCR (`parseContinente`/`parsePadaria`) | **ELIMINATED** | Not invoked |
| Pass C baseline GPT | **ELIMINATED** as mutation site | Emits qty=1; is the “before” state |
| Monetary binding (`bindMonetaryColumns`) | **ELIMINATED** | Preserves qty; halves unit_price |
| Reconcile / finalize | **ELIMINATED** | Qty invariant proven |
| Persistence | **ELIMINATED** | Out of scope; stores Hybrid H qty |
| Procurement / operational costing / ingredient UI | **ELIMINATED** | Out of scope |
| **Hybrid H table GPT pass** | **PROVEN** | First appearance of qty=2 |
| Hybrid H crop geometry | **POSSIBLE** | Indirect — changes vision input between eras |
| Hybrid H prompt/schema delta | **POSSIBLE** | Correlates with transition; bad-path GPT unproven |
| Hybrid H selection/synthesis/post-processing | **ELIMINATED** | No such stages |

---

### Confidence

| Claim | Confidence |
|-------|------------|
| Quantity mutates at Hybrid H table GPT pass (not downstream) | **91%** |
| Downstream stages preserve quantity | **97%** |
| Bad-path GPT raw emits qty=2 (not binder inflation) | **78%** (inferred; raw capture missing) |
| Mechanism: pack-metadata → purchased-qty conflation on undiscounted Bocconcino rows | **72%** |
| **Overall root localization at Pass C/Hybrid H GPT boundary** | **88%** |

---

## Machine-readable artifact

Full structured trace: `.tmp/family-a-transition-trace/trace.json`

## Related prior traces

- `.tmp/ricotta-root-cause-trace/` — end-to-end Ricotta (includes downstream; this trace stops at Hybrid H boundary)
- `.tmp/mezzi-root-cause-trace/` — end-to-end Mezzi
