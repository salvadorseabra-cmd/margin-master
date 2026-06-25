# Post-Deploy Regression Audit — OCR Quantity Strip Extraction (v40)

**Mode:** STRICT READ-ONLY · **VL:** `bjhnlrgodcqoyzddbpbd` · **Invoice:** `ab52796d-de1d-418d-86e7-230c8f056f09`

## Verdict: **CONTINUE_WITH_FOLLOWUPS**

| Area | Verdict |
|------|---------|
| Gorgonzola qty | Real improvement, incomplete — prepass 2 → 1.30 (anchored); PDF 1.35 |
| Bresaola qty | Fixed — prepass 2 → 1.83 final |
| Prosciutto extraction | No v39→v40 delta — identical API fields |
| Prosciutto "Possible match" | Real UI regression, not v40 prepass — match-layer / re-read side effect |
| Rollback? | **No** — would regress Gorgonzola/Bresaola without fixing Prosciutto |

---

## T1 — Validation matrix (pre v39 vs post v40)

| Product | PDF Qtd | Pre v39 prepass | Post v40 prepass | Pre v39 final | Post v40 final | Status |
|---------|---------|-----------------|------------------|---------------|----------------|--------|
| Gorgonzola | 1.35 | 2 | **1.30** | 1.05 | **1.30** | PARTIAL FIX |
| Bresaola | 1.83 | 2 | 1.80 | 1.83 | 1.83 | FIX |
| Prosciutto | 4.30 | 4.30 | 4.30 | 4.30 | 4.30 | UNCHANGED |
| Mortadella | 3.11 | 3.10 | 3.10 | 3.11 | 3.11 | UNCHANGED |

Sources: `.tmp/ocr-prepass-forensics-audit/results.json` (v39), `.tmp/ocr-prepass-fix-implementation/live-reextract.json` (v40)

---

## T5 — Side-by-side: Gorgonzola

| Field | Pre-deploy (v39) | Post-deploy (v40) |
|-------|------------------|-------------------|
| Description | `Arrigoni Formaggi - Gorgonzola DOP Dolce Linea Castelfrigo 1/8 - 1,5kg Produto de Stock` | Same |
| `ocr_quantity` | 2 | **1.30** |
| `pass_c_quantity` | 1.05 | 1.05 |
| Final quantity | 1.05 | **1.30** |
| `quantity_anchored` | false | **true** |
| Unit price (API) | 9.95 | 9.95 |

User-observed €9.88 is not in v40 API artifact — likely stale persisted row or historical v28 cluster, not v40 extraction.

---

## T5 — Side-by-side: Prosciutto

| Field | Pre-deploy (v39) | Post-deploy (v40) | Delta? |
|-------|------------------|-------------------|--------|
| Description | `Rovagnati - Assaporami Prosciutto Cotto Scelto HC 4,3-4,5kg Produto de Stock` | Identical | No |
| Quantity | 4.30 | 4.30 | No |
| Unit price | 8.50 | 8.50 | No |
| Total | 36.54 | 36.54 | No |
| `ocr_quantity` | 4.30 | 4.30 | No |
| `quantity_anchored` | false | false | No |

---

## T6 — First divergence stage

**Gorgonzola:** First change at **qty prepass** (2 → 1.30). Pass C, description, unit price unchanged. Anchoring activates as consequence.

**Prosciutto:** **No extraction-pipeline divergence.** Match label change occurs after extraction in client match layer.

---

## T2/T3 — Prosciutto "Possible match"

1. Confirmed override keyed on normalized description without `Rovagnati -` prefix / `Produto de Stock` suffix (`.tmp/emporio-deli-family-audit/results.json`)
2. v39/v40 API returns full Pass C name → override key miss
3. Re-read delete/recreate rotates `invoice_item_id` → orphaned `invoice_item_matches` (`.tmp/post-deploy-persistence-verification/results.json`)
4. Virtual matcher returns `semantic`/`operational-equivalent` → "Possible match"

**Not caused by v40 strip prepass.** Would occur on v39 if re-read persisted full Pass C names.

---

## T4 — What v40 changed

| Field | Changed? | Affects matching? |
|-------|----------|-------------------|
| Description (Pass C) | No | Yes (primary input) |
| Quantity | Yes — Gorgonzola, Bresaola | Indirect |
| Unit price | No | Indirect |
| `extraction_meta` | Yes — Gorgonzola anchored | Yes |
| Match confidence code | No | No |

---

## T7 — Gorgonzola 1.35 → 1.30

- PDF Qtd column: **1,35** (`.tmp/fraction-row-crop-audit/`)
- v39: prepass **2** from `1/8` fraction metadata
- v40: 41px strip eliminates integer-2 hallucination; GPT reads **1.30**
- Likely mechanism: narrow-strip digit OCR on ~41px column (3↔0/5 ambiguity)
- Anchoring correctly prefers 1.30 over Pass C 1.05

---

## Final answers

1. **Prosciutto regression real?** Yes in UI if re-read ran; no in v40 extraction API.
2. **UI only or data change?** Both possible — client label logic; data if re-read persisted new names/IDs.
3. **Deploy affect matching?** No directly — v40 is prepass-only.
4. **Why 1.30 not 1.35?** Strip OCR precision gap on narrow Qtd column.
5. **Safe to continue?** **Yes** — continue v40; add strip precision fix; address Prosciutto via alias/re-seed.
