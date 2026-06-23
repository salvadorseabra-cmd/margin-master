# Family A Hybrid H Diff Attribution

**Generated:** 2026-06-22  
**Mode:** STRICT READ-ONLY  
**Validation Lab:** `bjhnlrgodcqoyzddbpbd`  
**Invoice:** `f0aa5a08-86a3-4938-99f0-711e86073968` (IL Bocconcino, 2026-05-08)  
**Rows:** RICOTTA TREVIGIANA 1,5KG · MEZZI PACCHERI MANCINI (CX 1KG*6)  
**Scope:** Prompt, Crop, Schema only. No downstream (binding, reconcile, persistence).

**Known:** PDF/OCR/Pass C qty=1 · Hybrid H qty=2 (10/10 stable) · Downstream preserves qty.

**Artifact gap:** No archived Hybrid H structured GPT raw JSON (`family-a-v25-raw-capture/artifact-index.json`: `v25HybridHRawGptCapture: none`). Hybrid H GPT qty=2 inferred from API output + downstream qty-invariant replay.

---

### Prompt Differences

Pass C source: `.tmp/passc-prompt-audit/passc-prompt.txt` (~125 lines, frozen 2026-06-11).  
Hybrid H source: `supabase/functions/extract-invoice/invoice-table-extraction.ts` L18–255 (~250 lines).

| Section | Pass C | Hybrid H | New? |
|---------|--------|----------|------|
| JSON schema in prompt | `{ name, quantity, unit, unit_price, total }` | `{ name, quantity, unit, gross_unit_price, discount_pct, line_total_net }` | **Yes** |
| User message | `Extract all invoice line items from this restaurant invoice table image.` | `Extract each visible invoice line item. Copy quantity, gross_unit_price, discount_pct, and line_total_net from their labeled table columns.` | **Yes** |
| Core quantity rule | `quantity must represent the PURCHASED quantity` | Same + `Copy quantity ONLY from the quantity column` | Extended |
| Infer from description | `But DO infer quantity/unit when clearly present inside product names` | `Descriptions NEVER override table quantities or prices` | **Reversed** |
| Pack-count examples | `"Coca-Cola 33cl Pack 24" → quantity: 24`; `"Hamburger Angus 180gr Caixa 40 un" → quantity: 40` | Removed as primary guidance | **Reversed** |
| PACK NOTATION IS METADATA | Absent | `*2, *6, *24, x15, 1kg*2, (CX 2.5KG*6)` = metadata, NOT purchased qty unless column shows it | **Yes** |
| Column vs description | Absent | `When quantity column AND description disagree → ALWAYS trust the quantity column` | **Yes** |
| QUANTITY COLUMN ISOLATION | Absent (added in Pass C refinement subset only) | Qty never from PREÇO/VALOR/description; Açúcar `9,99` → NOT qty 9 | **Yes** (full Hybrid H) |
| FRACTIONAL QUANTITIES | Absent in passc-prompt snapshot | Copy `0,5` / `1,5` exactly; do NOT round 0,5→1 | **Yes** |
| `1,5KG` in description | No rule | Fractional rule applies to **column** decimals; no Ricotta-specific negative | Partial |
| CX / `*N` examples | Pack 24→qty 24 (encourages inference) | `(CX 2,5KG*6)` → qty **1 NOT 6**; `1kg*2` → qty **1 NOT 2**; `pet 5l*2` → qty **1 NOT 2** | **Yes** |
| Bocconcino examples | None | `Bocconcino DESC with %: 20,00% → discount_pct: 20` | **Yes** |
| POMODORI negative | None | `"POMODORI PELATI (CX 2,5KG*6)" qty 1,000 → quantity: 1 (NOT 6)` | **Yes** |
| Acém 15kg example | `quantity: 15, unit: "kg"` (infer from name) | `quantity: null` when NO quantity column visible | **Reversed** |
| COLUMN-FAITHFUL EXTRACTION | Absent | Full section: 5 column mappings (QUANT/P.VENDA/DESC/VALOR/name) | **Yes** |
| MONETARY COLUMN BINDING | `unit_price` + `total` authoritative | `gross_unit_price`, `discount_pct`, `line_total_net` from separate columns | **Yes** |
| ROW/TOTAL ISOLATION | Absent | Monetary values from same row only; VALOR never copied from P.VENDA | **Yes** |
| Emporio / Mammafiore blocks | Absent | Dense-table VALOR, Desc.(%) rules, IVA ignore | **Yes** |
| PRICE ACCURACY | Read qty + unit_price + total digit by digit | Read PREÇO + VALOR; never recompute line_total_net from qty×price | Extended |
| REJECT phantom rows | Absent | Lot/expiry sub-lines not standalone rows | **Yes** |

#### Quantity-related instructions **added** in Hybrid H (not in Pass C snapshot)

1. `Copy quantity ONLY from the quantity column. Never override with numbers from the description.`
2. `Descriptions NEVER override table quantities or prices.`
3. `PACK NOTATION IN DESCRIPTIONS IS METADATA` — `*2, *6, *24, x15, 33cl*24, 1kg*2, CX6, (CX 2.5KG*6)` not purchased qty.
4. `When quantity column AND description disagree → ALWAYS trust the quantity column.`
5. `QUANTITY COLUMN ISOLATION` — qty never from PREÇO UNITÁRIO, VALOR, or description pack tokens (`10x1`, `Pack24`, etc.).
6. `Do not take the leading digit of a price (e.g. 9,99) as quantity.`
7. Açúcar negative: column `1` + P.VENDA `9,99` → qty **1 NOT 9**.
8. `FRACTIONAL QUANTITIES` — copy `0,5` / `1,5` exactly from column; do NOT round.
9. Hortelã positive: column `0,5` + unit `KG` → qty **0.5**.
10. POMODORI negative: `(CX 2,5KG*6)` + column `1,000` → qty **1 NOT 6**.
11. Aceto negative: `pet 5l*2` + column `1` → qty **1 NOT 2**.
12. Rulo negative: `1kg*2` + column `1` → qty **1 NOT 2**.
13. Ginger Beer negative: column `2` → qty **2 NOT 24**.
14. Peroni positive: column `24` overrides `*24` metadata in description.
15. Acém revised: no visible qty column → `quantity: null` (Pass C inferred 15 from name).
16. User message explicitly names `quantity` as a column to copy.
17. `When quantity > 1, line_total_net should exceed gross_unit_price` (indirect qty semantics).
18. Emporio Gorgonzola / SanPellegrino negatives against qty synthesis from price math.

#### Quantity-related instructions **removed or reversed** from Pass C

1. `But DO infer quantity/unit when clearly present inside product names` — **removed**.
2. Pack-count positive examples (`Pack 24 → quantity: 24`, `Caixa 40 un → 40`) — **removed/replaced** by PACK METADATA rule.
3. `Acém Novilho Extra s/ osso 15kg → quantity: 15` — **reversed** to null when column absent.

---

### Schema Differences

| Field | Pass C | Hybrid H |
|-------|--------|----------|
| `name` | `string` | `string` |
| `quantity` | `number \| null` | `number \| null` (same type) |
| `unit` | `string \| null` | `string \| null` |
| `unit_price` | `number \| null` | **Removed from GPT schema** |
| `total` | `number \| null` | **Removed from GPT schema** |
| `gross_unit_price` | absent | `number \| null` **NEW** |
| `discount_pct` | absent | `number \| null` **NEW** |
| `line_total_net` | absent | `number \| null` **NEW** |
| Response enforcement | `json_object` (loose) | `json_schema` strict (`TABLE_EXTRACTION_RESPONSE_FORMAT` L257–293) |
| All fields required | implicit | strict: all 6 item fields required |

**Did quantity field meaning change?** **Yes — in prompt semantics, not JSON type.** Pass C allowed (and exemplified) inferring purchased qty from pack notation in descriptions. Hybrid H instructs column-only qty and treats `*N`/CX tokens as metadata. The `quantity` key name and `number|null` type are unchanged.

**Family A bad-path structured output:** Both Ricotta and Mezzi return `gross_unit_price: null`, `discount_pct: null`, `line_total_net: null` at API layer (legacy bleed to `unit_price`/`total` only). Schema shift did not produce populated structured monetary fields for these rows.

---

### Crop Differences

**Pass C era (5-row crop):** `bocconcino-investigation/crop-bounds.json` — top=561, bottom=881, height=320px. Mozzarella + Stracciatella excluded.  
**Hybrid H era (7-row crop):** post commit `2edcd02` — full table 7/7 rows (`hallucination-audit/REPORT.md`).

| Row | Pass C visible? | Hybrid H visible? |
|-----|:-------------:|:-----------------:|
| MOZZARELLA FIOR DI LATTE "IL BOCCONCINO" 125GR*8 | **No** (cropped out) | **Yes** |
| STRACCIATELLA 250 GR | **Partial** (metadata tail only) | **Yes** |
| **MEZZI PACCHERI MANCINI (CX 1KG*6)** | **Yes** (first complete row in 5-row crop) | **Yes** (row 3/7) |
| POMODORI PELATI (CX 2,5KG*6) | Yes | Yes |
| ACQUA S.PELLEGRINO (CX 75CL*15) | Yes | Yes |
| **RICOTTA TREVIGIANA 1,5KG** | **Yes** (row 4/5) | **Yes** (row 6/7) |
| ROLO DE CABRA E VACA 1KG | Yes | Yes |

**Rows only in Hybrid H crop (vs Pass C 5-row):** MOZZARELLA (full row), STRACCIATELLA (full row vs metadata fragment).

#### Neighbour context for target rows

**RICOTTA TREVIGIANA 1,5KG**

| Neighbour | Pass C 5-row crop | Hybrid H 7-row crop |
|-----------|-------------------|---------------------|
| Above | ACQUA qty=2 | ACQUA qty=2 |
| Below | ROLO qty=1 | ROLO qty=1 |

Ricotta adjacents are **identical** across eras. Only row index shifts (4/5 → 6/7).

**MEZZI PACCHERI MANCINI (CX 1KG*6)**

| Neighbour | Pass C 5-row crop | Hybrid H 7-row crop |
|-----------|-------------------|---------------------|
| Above | *(none — first complete row)* | MOZZARELLA qty=10, STRACCIATELLA qty=24 |
| Below | POMODORI qty=1 | POMODORI qty=1 |

Mezzi gains two high-qty discounted rows above in Hybrid H crop only.

#### Crop isolation control (critical)

`passc-refinement-validation/reextract/f0aa5a08-86a3-4938-99f0-711e86073968.json` (2026-06-11, pre-v25): **7 rows** including Mozzarella + Stracciatella, **Mezzi qty=1**, **Ricotta qty=1**.  
`final-validation-lab-rerun/extracts/f0aa5a08-86a3-4938-99f0-711e86073968.json` (v25, 2026-06-12): same 7-row geometry, **Mezzi qty=2**, **Ricotta qty=2**.

**Same crop row set + Pass C-era pipeline → qty=1. Same crop + Hybrid H → qty=2.** Crop delta alone cannot explain qty=2.

---

### Family A Signal Elimination

| Signal | Visible Pass C? | Visible Hybrid H? | Both? | Eliminated as sole explanation? |
|--------|:-------------:|:-----------------:|:-----:|:-------------------------------:|
| `1,5KG` decimal weight in description (Ricotta) | Yes (OCR identical) | Yes | **Yes** | **Yes** — Pass C reads qty=1 with same token |
| `CX 1KG*6` pack notation (Mezzi) | Yes | Yes | **Yes** | **Yes** — Pass C reads qty=1 with same token |
| blank DESC (undiscounted) | Yes | Yes | **Yes** | **Yes** — shared with Rolo (qty=1 in Hybrid H) |
| unit ≈ total at qty=1 | Yes (7.967≈7.97; 27.3≈27.3) | Yes | **Yes** | **Yes** — necessary but not sufficient; Rolo shares, qty=1 |
| neighbouring Acqua qty=2 | Yes (5-row + 7-row) | Yes | **Yes** | **Yes** — Acqua control: PDF qty=2, not inflation |
| neighbouring Pomodori discount (DESC 20%) | Yes | Yes | **Yes** | **Yes** — Pomodori same pipeline, qty=1 |
| row ordering / index in crop | Mezzi 1/5 vs 3/7 | Differs vs 5-row only | Partial | **Yes** for 7-row control — passc-refinement 7-row order matches Hybrid H, qty still 1 |
| supplier context (IL BOCCONCINO) | Not in table GPT prompt | Not in table GPT prompt | **Yes** | **Yes** — never injected |
| Mozzarella qty=10 / Stracciatella qty=24 above Mezzi | No (5-row crop) | Yes (7-row) | No | **Yes** — present in passc-refinement 7-row reextract; Mezzi still qty=1 |
| QUANT column `1,000` | Yes | Yes | **Yes** | **Yes** — ground truth; both eras see same OCR text |

---

### Candidate Ranking

| Rank | Candidate | Present only in Hybrid H? | Could explain qty=2? | Evidence |
|------|-----------|:-------------------------:|:--------------------:|----------|
| **1st** | **Prompt additions + user message change** | **Yes** (vs Pass C snapshot) | **Yes** | passc-refinement 7-row reextract qty=1 → v25 Hybrid H 7-row qty=2; prompt is primary delta between those deploys. Column-faithful user message + structured monetary instructions change GPT task framing. Pack-metadata negatives exist but Mezzi/Ricotta still qty=2 — rules did not prevent inflation. |
| **2nd** | **Schema additions** (`gross_unit_price`, `discount_pct`, `line_total_net` + strict json_schema) | **Yes** | **Possible** | Correlates with Hybrid H deploy; bad-path rows return null structured fields (legacy bleed). Pomodori uses same schema, qty=1. Cannot isolate from prompt — deployed atomically. |
| **3rd** | **Additional crop rows** (Mozzarella, Stracciatella) | **Yes** (vs 5-row Pass C) | **Unlikely** | passc-refinement 7-row includes same rows; Mezzi/Ricotta qty=1. Pomodori/Rolo/Acqua on 7-row crop unaffected. |
| — | Supplier metadata | No | No | Not in table GPT prompt either era |
| — | Monetary binding (`bindMonetaryColumns`) | Hybrid H only | **No** | Downstream; preserves qty (production replay, `family-a-transition-trace/trace.json`) |
| — | Reconcile / finalize | Both eras | **No** | Qty invariant proven |
| — | Persistence | — | **No** | Out of scope |

#### Elimination table (Task 5)

| Candidate | Present only in Hybrid H? | Could explain qty=2? |
|-----------|:-------------------------:|:--------------------:|
| Prompt additions | Yes | **Yes** |
| Schema additions | Yes | **Possible** (correlated with prompt) |
| Additional crop rows | Yes (vs 5-row Pass C only) | **No** (disproven by 7-row Pass C control) |
| Supplier metadata | No | No |
| Monetary binding | Yes (post-GPT) | **No** (out of scope; qty-invariant) |
| Reconcile | Both | **No** |
| Persistence | — | **No** |

---

### Most Likely Difference (ranked, evidence only)

**1st — Hybrid H prompt delta (system + user message)**  
- passc-refinement reextract (7 rows, 2026-06-11): Ricotta qty=1, Mezzi qty=1.  
- final-validation-lab-rerun v25 (7 rows, 2026-06-12): Ricotta qty=2, Mezzi qty=2 (10/10 stable).  
- Crop geometry and target-row OCR text identical; prompt/user-message/schema deploy changed between dates.  
- Pass C allowed infer-from-name + pack-count examples; Hybrid H replaced with column-faithful + PACK METADATA — GPT behavior on undiscounted blank-DESC rows with unit≈total changed for Family A only.

**2nd — Structured response schema**  
- GPT must emit `gross_unit_price`/`discount_pct`/`line_total_net` instead of `unit_price`/`total`.  
- Family A rows return all-null structured monetary fields; API shows legacy bleed.  
- Same schema yields qty=1 for Pomodori (has DESC 20%) and Rolo on same invoice — schema alone insufficient.

**3rd — Crop geometry (5→7 rows)**  
- True for DB-ingest-era Pass C (5-row) vs Hybrid H (7-row).  
- **Disproven as primary cause** by passc-refinement 7-row control with qty=1.  
- Mezzi-only neighbour change (Mozzarella/Stracciatella) does not correlate with qty=2.

---

### Confidence

| Claim | Confidence |
|-------|------------|
| PDF/OCR QUANT=1,000 for Ricotta and Mezzi | 0.97 |
| Pass C emits qty=1 (5-row invoke + 7-row reextract + gpt-raw cache) | 0.97 |
| Hybrid H API emits qty=2 stable 10/10 | 0.97 |
| Downstream does not modify quantity | 0.97 |
| Crop alone does not explain qty=2 (7-row Pass C control) | 0.92 |
| Prompt delta is most likely Hybrid H change responsible | 0.82 |
| Schema delta is 2nd-most likely (not isolable from prompt deploy) | 0.68 |
| Hybrid H GPT raw JSON had qty=2 | 0.78 (inferred; no archived capture) |
| **Overall attribution confidence** | **0.80** |

---

## Sources

- `supabase/functions/extract-invoice/invoice-table-extraction.ts`
- `.tmp/passc-prompt-audit/passc-prompt.txt`
- `.tmp/passc-refinement-validation/reextract/f0aa5a08-86a3-4938-99f0-711e86073968.json`
- `.tmp/persistence-audit/pass-c-raw/f0aa5a08-86a3-4938-99f0-711e86073968-gpt-raw-cache.json`
- `.tmp/bocconcino-investigation/` (REPORT.md, crop-bounds.json, extract-invoice-response.json)
- `.tmp/final-validation-lab-rerun/extracts/f0aa5a08-86a3-4938-99f0-711e86073968.json`
- `.tmp/final-stability-audit/extracts/f0aa5a08-86a3-4938-99f0-711e86073968-all-runs.json`
- `.tmp/family-a-input-diff/`, `.tmp/family-a-transition-trace/`
- `.tmp/family-a-v25-raw-capture/artifact-index.json`, `edge-invoke-final.json`
- `.tmp/family-a-scope-audit/audit-result.json`
- `.tmp/hallucination-audit/REPORT.md`

Machine-readable: `.tmp/family-a-hybrid-diff-attribution/attribution.json`
