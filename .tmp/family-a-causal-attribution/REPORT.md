# Family A Causal Attribution — Prompt vs Schema

**Generated:** 2026-06-22  
**Mode:** STRICT READ-ONLY  
**Validation Lab:** `bjhnlrgodcqoyzddbpbd`  
**Invoice:** `f0aa5a08-86a3-4938-99f0-711e86073968` (IL Bocconcino, 2026-05-08)  
**Rows:** RICOTTA TREVIGIANA 1,5KG · MEZZI PACCHERI MANCINI (CX 1KG*6)  
**Scope:** Prompt vs Schema causality only. Crop, binding, reconcile, persistence, UI eliminated by prior work.

**Known baseline:** PDF/OCR/Pass C qty=1 · Hybrid H qty=2 (10/10 stable) · Downstream qty-invariant.

**Artifact gap:** No archived Hybrid H structured GPT raw JSON (`family-a-v25-raw-capture/artifact-index.json`: `v25HybridHRawGptCapture: none`). No Ricotta/Mezzi captures at v21–v23 deploys; attribution between prompt and schema relies on version-staged controls and differential row analysis.

---

### Timeline

| Change | Introduced | Deploy / evidence | Same deploy as Family A qty=2? |
|--------|------------|-------------------|:------------------------------:|
| **Table-scoped 3-pass OCR** | 2026-06-09 `9f26c0a` | Pre-VL baseline | No |
| **Crop geometry fix (getPixelAt)** | 2026-06-09 `44a2abb` | v20 era | No |
| **Crop 5→7 rows (Mammafiore/Bocconcino)** | 2026-06-10 `2edcd02` | Pre-v21 | **No** — passc-refinement 7-row reextract qty=1 |
| **Pass C discounted-line preserve** | 2026-06-10 `64bcb14` | v20 era | No |
| **Pass C column-faithful prompt** | 2026-06-11 01:48 `c33a7f1` | v20 era | No — passc-refinement qty=1 |
| **Pass C refinement (isolation + fractional)** | 2026-06-11 02:05 `04c0d88` | v20 era | No — passc-refinement qty=1 |
| **Model** | `gpt-4.1` throughout | Unchanged temp=0 seed=42 | No |
| **Hybrid H Phase 1+2 prompt** | 2026-06-12 00:19 `65452a9` | **v21** @ 2026-06-11 23:19 UTC | **Partial** — prompt live at v21; Family A not captured until v25 |
| **Phase 3 monetary binder** | 2026-06-12 00:28 `de556e0` | **v22** @ 2026-06-11 23:35 UTC | No — qty-invariant (production replay) |
| **Strict `json_schema` (removes `unit_price`/`total` from GPT contract)** | 2026-06-12 01:03 `ec5f42f` | **v23** @ 2026-06-12 00:03 UTC | **Partial** — schema live at v23; Family A not captured until v25 |
| **Emporio dense-table prompt blocks** | 2026-06-12 23:06 `792adb8` | Post-v25 | No |
| **Mammafiore IVA/Valor isolation** | v29–v31 era | Post-Family A | No |
| **Architecture (single table GPT pass)** | Unchanged Pass C → Hybrid H | Same code path | No |
| **Family A qty=2 first observed** | — | **v25** `final-validation-lab-rerun` 2026-06-12 22:44 | **Yes** |
| **Family A stable** | — | v25/v26/v28/v30/v36 edge invokes | Yes |

**Version-staged controls (Bocconcino Pomodor as proxy; Ricotta/Mezzi not logged at v21–v23):**

| Version | Commit phase | Pomodor qty | Structured fields in API | Ricotta/Mezzi |
|---------|--------------|-------------|--------------------------|---------------|
| Pass C reextract | `04c0d88` era | 2 (GT bleed) | legacy only | **qty=1** |
| v21 | Phase 1+2 | 1 (5/5 stable) | null structured | **Not captured** |
| v22 | + binder | 1 (5/5 stable) | null structured | **Not captured** |
| v23 | + strict schema | 1 (5/5 stable) | null structured | **Not captured** |
| v25+ | bundled | 1 (10/10) | null structured | **qty=2 (10/10)** |

**Isolation control (eliminates crop):** `passc-refinement-validation/reextract/f0aa5a08-...json` (2026-06-11, 7 rows): Ricotta qty=1, Mezzi qty=1. `final-validation-lab-rerun/extracts/f0aa5a08-...json` (v25, 7 rows): Ricotta qty=2, Mezzi qty=2. Same row geometry; prompt/schema bundle changed.

---

### Prompt Review

Pass C baseline: `.tmp/passc-prompt-audit/passc-prompt.txt` (~125 lines, frozen 2026-06-11).  
Hybrid H: `invoice-table-extraction.ts` L18–255 (~250 lines).

#### Quantity-related instructions added in Hybrid H (beyond Pass C refinement `04c0d88`)

| Instruction | Could increase inflation? | Could decrease? | Classification |
|-------------|:-------------------------:|:---------------:|----------------|
| User message: copy `quantity, gross_unit_price, discount_pct, line_total_net` together | **Yes** — couples qty task to structured monetary extraction | — | **Supports Prompt** (interaction) |
| `TOTAL COLUMN ISOLATION`: when qty>1, `line_total_net` should exceed `gross_unit_price` | **Yes** — on unit≈total rows may bias toward qty>1 | — | **Supports Prompt** |
| `ROW-ISOLATION MONETARY COLUMNS` | Neutral for qty | Neutral | Neutral |
| Emporio / Mammafiore dense-table blocks | No (other suppliers) | — | Neutral |
| `REJECT phantom rows` | — | **Yes** | Neutral (not Family A) |
| JSON schema block in prompt: `gross_unit_price/discount_pct/line_total_net` replace `unit_price/total` | Indirect — reframes qty alongside monetary columns | — | **Supports Interaction** |
| `PACK NOTATION IS METADATA` | — | **Yes** | **Contradicts** (Mezzi still qty=2) |
| `Copy quantity ONLY from quantity column` | — | **Yes** | **Contradicts** |
| `FRACTIONAL QUANTITIES` — copy 1,5 exactly | — | **Yes** | **Contradicts** (Ricotta still qty=2) |
| POMODORI/Rulo/Aceto `*N → qty 1 NOT N` negatives | — | **Yes** | **Contradicts** (Mezzi still qty=2) |
| `When quantity column AND description disagree → trust column` | — | **Yes** | **Contradicts** |

#### Quantity-related instructions removed or reversed from Pass C snapshot

| Instruction | Effect | Classification |
|-------------|--------|----------------|
| `But DO infer quantity/unit when clearly present inside product names` | Removed | **Contradicts** prompt-as-cause (removal should decrease inflation) |
| Pack-count positives (`Pack 24 → qty 24`) | Removed | **Contradicts** |
| `Acém 15kg → quantity: 15` from description | Reversed to null | **Contradicts** |

**Prompt summary:** Hybrid H adds far more **anti-inflation** qty rules than pro-inflation rules. The net new pro-inflation content is narrow: (1) user-message task coupling, (2) `qty>1 → line_total_net > gross_unit_price` heuristic. Pass C refinement already contained column-faithful + pack-metadata core and produced qty=1 on Family A rows. **Prompt alone is an incomplete explanation.**

---

### Schema Review

| Field | Pass C | Hybrid H (v23+) | Quantity interpretation impact? |
|-------|--------|-------------------|--------------------------------|
| `quantity` | `number \| null` | `number \| null` (unchanged type) | Semantics via prompt only |
| `unit_price` | required in GPT contract | **removed** from strict schema (`ec5f42f`) | **Yes** — blocks legacy direct-copy escape hatch |
| `total` | required in GPT contract | **removed** | **Yes** |
| `gross_unit_price` | absent | **required** (nullable) | **Yes** — model must emit even when blank DESC |
| `discount_pct` | absent | **required** (nullable) | **Yes** |
| `line_total_net` | absent | **required** (nullable) | **Yes** |
| Enforcement | `json_object` (loose) | `json_schema` strict (`ec5f42f`) | **Yes** — all 6 item fields mandatory |

**Family A bad-path structured output (v25 API layer):**

| Row | `gross_unit_price` | `discount_pct` | `line_total_net` | `quantity` |
|-----|-------------------|----------------|------------------|------------|
| Ricotta | null | null | null | **2** |
| Mezzi | null | null | null | **2** |
| Pomodori (control) | null | null | null | **1** |
| Rolo (control) | null | null | null | **1** |

**Could schema population affect quantity?**

- **Plausible mechanism:** Strict schema removes `unit_price`/`total` from GPT output. On undiscounted blank-DESC rows, model returns all-null structured monetary fields (same as Pomodori/Rolo at API). Model may adjust `quantity` when it cannot satisfy implicit arithmetic between qty and monetary columns.
- **v22 evidence:** GPT ignored structured fields and returned legacy `unit_price`/`total` directly (`structured-monetary-trace/REPORT.md`). Binder no-op; Pomodor qty=1.
- **v23 evidence:** Strict schema blocks legacy path (`pomodor-v23-stability.json`). Pomodor still qty=1; output numerically identical to v22.
- **Schema alone insufficient:** Same strict schema on same invoice yields qty=1 for Pomodori and Rolo.

---

### Family A Compatibility

| Row signal | Prompt sensitivity | Schema sensitivity | Both required? |
|------------|-------------------|------------------|:--------------:|
| `1,5KG` decimal weight (Ricotta) | FRACTIONAL rule says copy from column, not inflate — **contradicts** | Bad-path null structured — shared with Rolo | **Likely yes** — weight token + bad-path |
| `(CX 1KG*6)` pack notation (Mezzi) | PACK METADATA + POMODORI negative — **contradicts** | Bad-path null structured — shared with Rolo | **Likely yes** — pack token + bad-path |
| Blank DESC (undiscounted) | No discount anchor for monetary columns | Forces null `discount_pct`; all structured null | Shared with Rolo (qty=1) |
| `unit_price ≈ total` at qty=1 | New `qty>1 → line_total > gross` rule may misfire | Without `unit_price`/`total` in schema, model cannot emit legacy closure | **Interaction** |
| IL BOCCONCINO template | Not in table GPT prompt either era | — | Necessary but not sufficient |
| QUANT column `1,000` | Both eras instruct column-only | Unchanged field | **Contradicts** all causes |

**Minimum separating combo** (from `family-a-scope-audit`): OCR qty=1 AND Hybrid H qty=2 (stable) AND undiscounted blank DESC AND unit≈total at qty=1 AND IL BOCCONCINO.

**Nearest control — ROLO DE CABRA E VACA 1KG:** shares blank DESC, undiscounted, unit≈total, same strict schema, same invoice — **qty=1 stable**. Lacks `*N` pack multiplier (Mezzi) and `1,5KG` decimal weight token (Ricotta).

**Compatibility verdict:** Prompt changes alone do not naturally target Ricotta/Mezzi without misfiring on identically structured Rolo. Schema changes alone affect all undiscounted rows equally. **Family A is compatible with an interaction model** where strict schema bad-path (null structured monetary) combines with description pack/weight tokens that survive despite explicit prompt negatives.

---

### Contradictions

#### Strongest evidence against Prompt as primary cause

1. **Pass C refinement already column-faithful:** `passc-refinement-validation/reextract/f0aa5a08-...json` — 7-row crop, pack-metadata rules, qty=1 for both Family A rows.
2. **Explicit anti-inflation negatives exist in Hybrid H** (POMODORI `*6→1`, FRACTIONAL `1,5`, PACK METADATA) yet Mezzi/Ricotta still qty=2.
3. **v21 deployed Hybrid H prompt** (`pomodor-5run-stability.json`) — no Family A row capture, but Pomodor qty=1 stable; pre-v21 deploy extract shows Mezzi/Ricotta qty=1 (`bocconcino-hybrid-validation/deployed-extract.json`).
4. **Removed infer-from-name** should decrease, not increase, inflation.

#### Strongest evidence against Schema as primary cause

1. **Pomodori and Rolo** on same v25 invoice use identical strict schema — qty=1.
2. **v23 strict schema deployed** before v25; Pomodor qty=1 unchanged vs v22 (`pomodor-v23-stability.json`).
3. **Quantity field type and name unchanged** — schema shift is monetary-field contract, not qty type.
4. **Downstream binding preserves qty=2** — inflation originates before binder (`family-a-transition-trace/trace.json`).

#### Strongest evidence against Interaction as primary cause

1. **Rolo control** shares undiscounted blank-DESC bad-path profile — qty=1 despite same schema envelope.
2. **No raw GPT JSON** to prove structured-null + qty=2 co-occur at emission (`artifact-index.json`).
3. **v21–v23 gap** — no Ricotta/Mezzi measurements between prompt deploy (v21) and first Family A capture (v25).

---

### Probability Attribution

| Cause | % | Rationale |
|-------|---:|-----------|
| **Prompt** | **30%** | Hybrid-only additions include pro-inflation task coupling (`qty>1` monetary heuristic, user message). But Pass C refinement with overlapping anti-inflation rules produced qty=1; most Hybrid qty instructions are anti-inflation; v21 prompt live before Family A documented. |
| **Schema** | **25%** | Strict `json_schema` removes legacy `unit_price`/`total` escape hatch; bad-path null structured fields on Family A rows. But same schema on Pomodori/Rolo yields qty=1; v23 live before v25 without captured Family A regression. |
| **Interaction** | **45%** | Only model consistent with: (a) Pass C qty=1 with shared anti-inflation prompt core, (b) Hybrid strict schema bad-path on undiscounted rows, (c) Family A limited to pack/weight token rows, (d) Rolo control with same schema but no token. Prompt coupling + schema contract change plausibly joint-trigger; neither alone separates from Rolo. |
| **Total** | **100%** | |

**Assumptions:**

1. First qty deviation is at table GPT pass (proven downstream-invariant).
2. passc-refinement 7-row reextract is valid Pass C-era control for prompt (not crop).
3. Absence of v21–v23 Ricotta/Mezzi captures does not prove qty=1 at those versions — treated as uncertainty widening schema/prompt shares.
4. Rolo is the strongest in-invoice control for differential attribution.
5. Crop, binding, reconcile, persistence excluded per prior investigations.

---

### Final Assessment

**C) Interaction primary**

Prompt-only and schema-only explanations each fail the Rolo control and the Pass C 7-row isolation control. The evidence best supports a **joint prompt+schema interaction** on undiscounted Bocconcino rows where strict structured monetary extraction fails (all-null bad path) and description pack/weight tokens (`*6`, `1,5KG`) distinguish Family A from Rolo.

Neither prompt nor schema is sufficient alone. Prompt is not the dominant single cause because anti-inflation rules outnumber pro-inflation rules and Pass C refinement already produced correct qty. Schema is not the dominant single cause because identical schema yields qty=1 on Pomodori and Rolo on the same invoice.

---

### Confidence

| Claim | Confidence |
|-------|------------|
| PDF/OCR QUANT=1,000 for Ricotta and Mezzi | 0.97 |
| Pass C emits qty=1 (7-row reextract + gpt-raw cache) | 0.97 |
| Hybrid H v25+ emits qty=2 stable 10/10 | 0.97 |
| Downstream does not modify quantity | 0.97 |
| Crop eliminated as cause | 0.92 |
| Family A first observed at v25 deploy bundle | 0.90 |
| Prompt vs schema not isolable by A/B deploy | 0.88 |
| Interaction more likely than either alone | 0.74 |
| Bad-path GPT raw emits qty=2 | 0.78 (inferred; no archived capture) |
| **Overall attribution confidence** | **0.72** |

---

## Sources

- `.tmp/family-a-hybrid-diff-attribution/`
- `.tmp/family-a-input-diff/`
- `.tmp/family-a-transition-trace/`
- `.tmp/passc-refinement-validation/reextract/f0aa5a08-86a3-4938-99f0-711e86073968.json`
- `.tmp/final-validation-lab-rerun/extracts/f0aa5a08-86a3-4938-99f0-711e86073968.json`
- `.tmp/final-validation-lab-rerun-v26/extracts/f0aa5a08-86a3-4938-99f0-711e86073968.json`
- `.tmp/final-validation-lab-rerun-v28/extracts/f0aa5a08-86a3-4938-99f0-711e86073968.json`
- `.tmp/final-stability-audit/extracts/f0aa5a08-86a3-4938-99f0-711e86073968-all-runs.json`
- `.tmp/family-a-v25-raw-capture/artifact-index.json`
- `.tmp/family-a-v25-raw-capture/edge-invoke-final.json`
- `.tmp/family-a-scope-audit/audit-result.json`
- `.tmp/bocconcino-hybrid-validation/deployed-extract.json`
- `.tmp/monetary-binding-final-validation/pomodor-5run-stability.json`
- `.tmp/monetary-binding-final-validation/pomodor-v23-stability.json`
- `.tmp/monetary-binding-final-validation/v22-final-validation-report.md`
- `.tmp/structured-monetary-trace/REPORT.md`
- `.tmp/passc-prompt-audit/passc-prompt.txt`
- `supabase/functions/extract-invoice/invoice-table-extraction.ts`
- Git: `c33a7f1`, `04c0d88`, `65452a9`, `de556e0`, `ec5f42f`, `792adb8`, `2edcd02`

Machine-readable: `.tmp/family-a-causal-attribution/attribution.json`
