# Bocconcino Missing Invoice Lines — Investigation Report

**Invoice:** IL BOCCONCINO Distribuição ALIMENTAR · 2026-05-08 · €290.64  
**VL project:** bjhnlrgodcqoyzddbpbd  
**Investigation date:** 2026-06-10

## Summary

**Missing stage:** Table crop (`detectTableBounds` → `cropTableRegionForLineItems`)  
**Root cause:** Crop top at y=561px cuts off the first two table rows (Mozzarella €81.23, Stracciatella €74.54); Pass C GPT only sees the cropped image and returns 5 lines starting at Mezzi Paccheri.

## Invoice identity

| Field | Value |
|-------|-------|
| ID | `f0aa5a08-86a3-4938-99f0-711e86073968` |
| Supplier | IL BOCCONCINO Distribuição ALIMENTAR |
| Date | 2026-05-08 |
| Total | €290.64 |
| Storage path | `acfb54e5-785f-4bc8-b47b-3914452e18a5/1781113610714-Screenshot_2026-06-07_at_21.04.58.png` |
| DB `invoice_items` count | **5** (expected **7**) |
| Pass C re-extract count | **5** (identical to DB) |

## Raw extracted rows

### DB (`invoice_items`)

| # | Name | Qty | Unit | Unit price | Total |
|---|------|-----|------|------------|-------|
| 1 | MEZZI PACCHERI MANCINI (CX 1KG*6) | 1 | un | 27.30 | 27.30 |
| 2 | POMODORI PELATI (CX 2,5KG*6) | 1 | un | 27.56 | 22.05 |
| 3 | ACQUA S.PELLEGRINO (CX 75CL*15) | 2 | un | 26.292 | 42.07 |
| 4 | RICOTTA TREVIGIANA 1,5KG | 1 | un | 7.967 | 7.97 |
| 5 | ROLO DE CARNE E VACA 1KG | 1 | un | 12.706 | 12.71 |

**DB line sum:** €112.10 (net líquido of visible rows)  
**Expected net líquido (all 7):** €267.87 → missing €155.77 = €81.23 + €74.54 ✓

### Pass C GPT JSON (re-invoked `extract-invoice`)

Same 5 rows as DB. See `extract-invoice-response.json`.

Missing from both:
- MOZZARELLA FIOR DI LATTE "IL BOCCONCINO" 125GR*8 — €81.23
- STRACCIATELLA 250 GR — €74.54

## OCR ground truth (first two lines)

Full image (752×1074) contains both rows clearly. Region **above crop top** (y=0–561) shows:

**Mozzarella (QJ0107*8)**
- MOZZARELLA FIOR DI LATTE "IL BOCCONCINO" 125GR*8
- Qty 10,000 / 10 CX / UNI · P.VENDA 9,500 EUR · DESC 14,50% · **VALOR LÍQUIDO 81,23 EUR** · IVA 6%

**Stracciatella (QJ0015)**
- STRACCIATELLA 250 GR
- Qty 24,000 / 0 CX / UNI · P.VENDA 4,141 EUR · DESC 25,00% · **VALOR LÍQUIDO 74,54 EUR** · IVA 6%

**Cropped table image sent to Pass C** (`table-crop.png`, y=561–881):
- Mozzarella: **not visible**
- Stracciatella: only metadata tail visible (`Lote Fab:07052026`, `Data de Validade:25-mai-2026`) — product name and amounts cropped out
- First complete row in crop: MEZZI PACCHERI MANCINI

## Stage analysis

| Stage | Mozzarella | Stracciatella | Evidence |
|-------|------------|---------------|----------|
| **Table crop** | ❌ Cropped out | ❌ Cropped out (metadata fragment only) | `crop-bounds.json`: top=561; `region-above-crop-top.png` has both rows; `table-crop.png` starts at Mezzi Paccheri |
| **GPT Pass C** | ❌ Not in JSON | ❌ Not in JSON | `extract-invoice-response.json`: 5 items, none match mozzarella/stracciatella |
| **Normalization** | N/A | N/A | No extra rows to normalize |
| **Reconcile** | N/A | N/A | `reconcileLineItemsToNetSubtotal` only adjusts existing row prices; cannot add rows |
| **Persistence** | N/A | N/A | DB count matches Pass C count (5) |
| **UI filtering** | N/A | N/A | `shouldRejectInvoiceIngredientRow` — all 5 rows eligible; no hidden DB rows |

## Crop / bounds detail

```
Full image:     752 × 1074 px
Detected bounds: top=561, bottom=881, headerTop=571, headerBottom=607, totalsStart=857
Crop height:    320 px (sent to GPT)
```

`detectTableBounds` scans y ∈ [12%, 55%] of image height for darkest 18-row grey band. On this invoice it locked onto y≈571 — **below** the real column header (Referência/Descrição at ~y400–500). Crop top = headerTop − 10 = **561**, which falls **between Stracciatella and Mezzi Paccheri**.

Re-invoking `extract-invoice` with the **full** image still returns 5 items because Pass C always runs `cropTableRegionForLineItems` internally.

## Root cause (proven)

1. `detectTableBounds` mis-identifies the table header band on this Bocconcino layout (QR codes + multi-line rows push the real header higher than the detected band at y=571).
2. `cropTableRegionForLineItems` crops from y=561, excluding the first two product rows.
3. GPT Pass C faithfully extracts the 5 visible rows from the cropped image.
4. All 5 persist to DB and display in UI — no downstream filtering.

## Evidence artifacts

```
.tmp/bocconcino-investigation/
  invoice-full.png              # Full invoice from storage
  region-above-crop-top.png     # y=0–561: Mozzarella + Stracciatella visible
  table-zone-400-650.png        # Real table header + first two rows
  table-crop.png                # What GPT sees (missing top rows)
  table-crop-top400.png
  crop-bounds.json
  extract-invoice-response.json # Pass C + full pipeline output
  extract-full-image.json       # Re-extract (still 5 — crop always applied)
  invoice-meta.json             # DB invoice + items
  summary.json
  REPORT.md
```
