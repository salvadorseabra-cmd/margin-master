# Fraction Row Crop & Prepass Visibility Audit

**Validation Lab:** `bjhnlrgodcqoyzddbpbd` · **Invoice:** `ab52796d-de1d-418d-86e7-230c8f056f09` · **Gorgonzola item:** `35bdf942-712b-46af-9f2e-666cb4744a88` · 2026-06-24

## Executive verdict

**Goal B** — GPT prepass prefers **fraction metadata** (`1/8`, `1/2`) over visible Qtd decimals. **Not Goal A or C:** table crop (y=430–851) fully contains Gorgonzola/Bresaola/Prosciutto rows; exported qtd-strips show **1,35**, **1,83**, **4,30**. Prosciutto prepass **4.30** correct on same crop. Integer prepass **2** clusters only on fraction-description rows.

| Goal | Verdict |
|------|---------|
| A — Crop lacks Qtd | **REJECTED** |
| B — GPT prefers fraction metadata | **SELECTED** |
| C — Both | **REJECTED** |
| Root cause (T8) | **B** — description override; **E rejected** (Qtd legible) |

## T1 — `cropTableRegionForLineItems` trace

1. parseImageDataUrl → Image.decode
1. detectTableBounds (L209) — grey/white header scan, totals edge peak
1. crop: image.crop(0, bounds.top, width, bounds.bottom - bounds.top)
1. toImageDataUrl → croppedDataUrl fed to runQuantityPrePass

Bounds: top **430**, bottom **851**, headerTop **466**, crop height **421px**

## T3 — Crop boundaries & row exports

| Row | Y bounds | Qtd printed | Inside crop? | Export |
|-----|----------|-------------|--------------|--------|
| gorgonzola | 478–520 | 1,35 | YES | `gorgonzola-crop.png` |
| prosciutto | 518–558 | 4,30 | YES | `prosciutto-crop.png` |
| bresaola | 556–600 | 1,83 | YES | `bresaola-crop.png` |

## T5 — Token table

| Token | Row | Meaning | In crop? | Could drive prepass=2? |
|-------|-----|---------|----------|------------------------|
| 1,35 | gorgonzola | Printed Qtd column kg weight | YES | NO |
| 1/8 | gorgonzola | Pack fraction in Designação (one-eighth wheel) | YES | **YES** |
| ~1,5kg | gorgonzola | Nominal pack weight metadata | YES | NO |
| 4,30 | prosciutto | Printed Qtd column — control row without pack fraction | YES | NO |
| ~4,25KG | prosciutto | Description weight range metadata | YES | NO |
| 1,83 | bresaola | Printed Qtd column kg weight | YES | NO |
| 1/2 | bresaola | Pack fraction in Designação (half piece) | YES | **YES** |
| 2 (integer) | gorgonzola|bresaola | Prepass OCR output — not printed in Qtd cells | NO | **YES** |
| Qtd. header | all | Column header label | NO | NO |

## T6/T7 — Prepass vs crop visibility

| Product | PDF Qtd | Qtd in crop | Prepass OCR | Pass C | Fraction token |
|---------|---------|-------------|-------------|--------|----------------|
| gorgonzola | 1.35 | 1,35 | 2 | 1.05 | 1/8 |
| prosciutto | 4.3 | 4,30 | 4.3 | 4.3 | — |
| bresaola | 1.83 | 1,83 | 2 | 1.83 | 1/2 |

## T8 — Root cause options

- **A:** Vision misread Qtd column cell — digit OCR error on printed decimals
- **B:** Description/pack-metadata override — fraction notation inferred as purchased qty 2
- **C:** Wrong column bleed — integer read from non-Qtd column
- **D:** Parsing/code bug — GPT returned correct qty, TypeScript corrupted to 2
- **E:** Crop/geometry failure — Qtd column illegible or excluded from prepass crop
- **Selected:** **B**
- **E rejected:** gorgonzolaRowVisible=true; qtd-strip PNGs show 1,35 and 1,83; Prosciutto 4,30 reads correctly from identical crop