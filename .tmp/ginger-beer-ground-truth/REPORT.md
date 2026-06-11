# Ginger Beer Ground Truth — Emporio Italia

**Invoice:** `17aa3591-ec98-4c21-89c9-5ae946bc97bb`  
**VL project:** `bjhnlrgodcqoyzddbpbd`  
**Investigation date:** 2026-06-10  
**Mode:** Read-only — no code changes

---

## Answer

**Primary origin: A — Source document contains `0.20cl`**

**First stage where `"0.20cl"` appears:** **PDF/Image visible text** (before any pipeline processing).

The printed invoice Designação column explicitly shows `Baladin - Ginger Beer 0.20cl`. The extraction pipeline copies this text faithfully through GPT Pass D (table specialist), `normalizeItems()`, and DB persistence. No stage introduces or transforms the volume token.

---

## Stage table

| Stage | Value | Contains `0.20cl`? |
|-------|-------|-------------------|
| **PDF/Image visible text** | `Baladin - Ginger Beer 0.20cl` (product code `BBB-GINGER33ITA` on same row) | **Yes — FIRST** |
| **OCR text (row crop)** | `Baladin - Ginger Beer 0.20cl` (printed as `0,20cl` with PT comma) | Yes (same as source) |
| **GPT JSON (Pass D)** | `"name": "Baladin - Ginger Beer 0.20cl"`, qty 24, unit un, €0.85 | Yes (faithful copy) |
| **normalizeItems()** | `Baladin - Ginger Beer 0.20cl` (unchanged) | Yes (pass-through) |
| **invoice_items.name (DB)** | `Baladin - Ginger Beer 0.20cl` | Yes (persisted) |

---

## Exact text at each stage

### 1. PDF/Image (source document)

Full Ginger Beer row as printed:

```
BBB-GINGER33ITA | 30-06-2027 | Baladin - Ginger Beer 0.20cl | IVA23 | 24,00 | 0,85 € | 5.00 | 19,38 €
```

- **Volume token:** `0.20cl` (also readable as `0,20cl` — Portuguese comma decimal separator)
- **Not** `33cl`, `0.33cl`, or bare `20cl` on the full-invoice / full-table views
- **Product code:** `BBB-GINGER33ITA` visible in Código column on the same row
- **SKU vs description mismatch is on the invoice itself:** code embeds `33` (33cl bottle SKU) but Designação prints `0.20cl`

### 2. OCR (row crop)

Manual transcription from `.tmp/ginger-beer-ground-truth/ginger-beer-row-crop.png` (automated row OCR skipped — no local `OPENAI_API_KEY`; see `row-ocr-result.json`):

```
BBB-GINGER33ITA | Baladin - Ginger Beer 0.20cl | … | 24,00 | 0,85 € | … | 19,38 €
```

**Pipeline note:** `extract-invoice/index.ts` does **not** invoke deterministic OCR parsers (`parseContinente`, `parsePadaria`, `stages.ts`). GPT-4.1 vision in Pass D acts as combined OCR + structured extraction. There is no separate logged raw-OCR artifact for table rows.

### 3. GPT JSON (Pass D — table specialist)

From fresh re-invoke (2026-06-10) and prior audit:

```json
{
  "name": "Baladin - Ginger Beer 0.20cl",
  "quantity": 24,
  "unit": "un",
  "unit_price": 0.85,
  "total": 19.38
}
```

Sources: `extract-invoice-retry.json`, `emporio-italia-investigation/extract-invoice-response.json`

### 4. normalizeItems()

```json
{
  "name": "Baladin - Ginger Beer 0.20cl",
  "quantity": 24,
  "unit": "un",
  "unit_price": 0.85,
  "total": 19.38
}
```

`normalizeItems()` in `invoice-table-extraction.ts` only validates/coerces field types. The `name` string is **not** transformed. Verified in `normalize-items-output.json`.

### 5. invoice_items.name (DB — live VL)

```json
{
  "id": "0dbbc281-9384-493f-9f92-68786058a5b5",
  "name": "Baladin - Ginger Beer 0.20cl",
  "quantity": 2,
  "unit": "cx",
  "unit_price": 9.69,
  "total": 19.38
}
```

Qty/unit changed on re-upload (24 un → 2 cx) but **`name` still contains `0.20cl`**.

---

## Why not B / C / D?

| Option | Verdict | Evidence |
|--------|---------|----------|
| **A) Source document** | **YES** | Full invoice + table crop show `0.20cl` in Designação before extraction |
| **B) OCR produced it** | No | No discrete OCR stage; row transcription matches source |
| **C) GPT produced it** | No | GPT copies visible text; re-invoke on full image returns same string |
| **D) Normalization produced it** | No | `normalizeItems()` is pass-through for `name` |

---

## Evidence files

| Path | Description |
|------|-------------|
| `invoice-full.png` | Original invoice screenshot (from VL storage) |
| `table-data-crop.png` | Table body crop showing Ginger Beer row in context |
| `ginger-beer-row-crop.png` | Single-row crop |
| `ginger-beer-desc-zoom4x.png` | 4× zoom of code + description columns |
| `row-ocr-result.json` | Manual row transcription |
| `extract-invoice-retry.json` | Fresh full-invoice re-extraction (2026-06-10) |
| `normalize-items-output.json` | Simulated normalizeItems() on GPT output |
| `stage-table.json` | Machine-readable stage summary |

---

## Pipeline architecture (relevant)

```
imageDataUrl
  → cropTableRegionForLineItems()
  → GPT-4.1 vision (Pass D, TABLE_EXTRACTION_SYSTEM_PROMPT)
  → parsed.items (JSON)
  → normalizeItems()          ← no name transformation
  → reconcileLineItemAmounts()
  → finalizeExtractedLineItems()
  → client persists invoice_items.name
```

No intermediate raw-OCR log exists for table rows. Pass D prompt even warns about messy OCR but instructs GPT to copy visible text faithfully.

---

## Implication

The volume bug (`0.20cl` → 2 ml via `detectVolume`) stems from **incorrect data printed on the supplier invoice** (or a supplier ERP typo: `0,20` instead of `33cl` / `20cl`), not from pipeline corruption. The product code `BBB-GINGER33ITA` hints the true bottle size is 33cl, but that code is **not** captured in `invoice_items` and is **not** used during extraction.
