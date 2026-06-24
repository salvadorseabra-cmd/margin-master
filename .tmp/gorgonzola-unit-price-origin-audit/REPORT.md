# Gorgonzola Unit Price Origin Audit

**Validation Lab:** `bjhnlrgodcqoyzddbpbd` · **Invoice:** `ab52796d-de1d-418d-86e7-230c8f056f09` · **Item:** `bece238e-fd6d-493c-8555-6921b164f97c` · **Read-only** · 2026-06-24

## Required question (A–F)

**B)** Structured extraction

## Required table

| Stage | Quantity | Unit Price | Total | Qty×Price |
|-------|----------|------------|-------|-----------|
| PDF (net implied) | 1.35 | 9.95 | 13.44 | 13.43 |
| OCR API pass-c-raw | 1.35 | 9.82 | 13.44 | 13.26 |
| Structured pre-bind (inferred Pass C → parseMonetaryLineItems) | 1.05 | 10.88 | 13.44 | 11.42 |
| After bindMonetaryColumns | 1.05 | 10.88 | 13.44 | 11.42 |
| After applyEffectivePaidPrice (same row) | 1.05 | 10.88 | 13.44 | 11.42 |
| API output v28 deploy replay | 1.05 | 10.88 | 13.44 | 11.42 |
| PDF structured after bindMonetaryColumns (control) | 1.35 | 9.95 | 13.44 | 13.43 |
| After normalizeInvoiceItemFields | 1.05 | 10.88 | 13.44 | 11.42 |
| Persistence insert payload | 1.05 | 10.88 | 13.44 | 11.42 |
| Persisted DB invoice_items | 1.05 | 10.88 | 13.44 | 11.42 |

## T1 — PDF source

| Field | Value |
|-------|-------|
| description | Arrigoni Formaggi - Gorgonzola DOP Dolce Linea Castelregio 1/8 ~1,5kg (GD87813) |
| quantity | 1.35 |
| gross unit price | €12.9 |
| discount | 22.85% |
| net unit price (implied) | €9.95 |
| line total | €13.44 |
| arithmetic | 1.35 × 12.90 × (1 − 0.2285) = 13.44 |

## T2 — OCR: did OCR contain 10.88?

**NO**

- **pass-c-raw extract-invoice API** (`.tmp/persistence-audit/pass-c-raw/17aa3591-extract-invoice.json`): unit_price=9.82, qty=1.35, total=13.44
- **passc-refinement reextract** (`.tmp/passc-refinement-validation/reextract/17aa3591.json`): unit_price=9.82, qty=1.35, total=13.44
- **emporio-footer extract-invoice** (`.tmp/emporio-footer-audit/emporio/extract-invoice-response.json`): unit_price=9.92, qty=1.35, total=13.44

## T3 — Structured extraction (before normalization): 10.88?

**YES** — v28 API output unit_price=10.88; inferred pre-bind handoff unit_price=10.88

```json
{
  "v28Gorg": {
    "name": "Arrigoni Formaggi - Gorgonzola DOP Dolce Linea Castelgrotti 1/8 - 1,8-1,9kg",
    "quantity": 1.05,
    "unit": null,
    "unit_price": 10.88,
    "total": 13.44
  },
  "inferredPreBind": {
    "name": "Arrigoni Formaggi - Gorgonzola DOP Dolce Linea Castelfrigo 1/8 - 1,5kg",
    "quantity": 1.05,
    "unit": "kg",
    "gross_unit_price": null,
    "discount_pct": null,
    "line_total_net": 13.44,
    "unit_price": 10.88,
    "total": 13.44
  }
}
```

## T4 — bindMonetaryColumns / applyEffectivePaidPrice

**First stage with unit_price=10.88:** **Structured pre-bind (inferred Pass C → parseMonetaryLineItems)**

bindMonetaryColumns changed unit_price: **NO**
applyEffectivePaidPrice would fire: **NO** (requires total < qty×unit_price per L117)

## T5 — normalizeInvoiceItemFields: unit_price change?

**NO** — input 10.88 → output 10.88

## T6 — Persistence payload vs structured vs DB

| Layer | qty | unit_price | total | matches DB? |
|-------|-----|------------|-------|-------------|
| v28 structured API | 1.05 | 10.88 | 13.44 | YES |
| insert payload | 1.05 | 10.88 | 13.44 | YES |
| DB row | 1.05 | 10.88 | 13.44 | — |

## T7 — Controls (Prosciutto, Mortadella, Bresaola)

| Product | qty | unit_price | total | qty×price | reconciles? |
|---------|-----|------------|-------|-----------|-------------|
| Assaporami Prosciutto Cotto Scelto HC 4,3-4,5… | 4.3 | 8.5 | 36.54 | 36.55 | YES |
| Rovagnati - Mortadella IGP 'Massima' con Pist… | 3.11 | 9.99 | 31.07 | 31.07 | YES |
| Rigamonti - Bresaola Punta d'Anca Oro 1/2 - 1… | 1.83 | 27.04 | 49.48 | 49.48 | YES |

**Gorgonzola diverges:** qty=1.05 (not PDF 1.35) + unit_price=10.88 (not PDF net 9.95 / OCR 9.82) while total=13.44 correct

## T8 — Root cause

- **Stage:** Structured pre-bind (inferred Pass C → parseMonetaryLineItems)
- **Wrong value:** **unit_price** (not quantity 1.05 nor total 13.44)
- **Defect category:** **B) Structured extraction**
- €10.88 first appears in structured Pass C handoff (v28 API replay ≡ DB). OCR artifacts show 9.82/9.92. bindMonetaryColumns and normalizeInvoiceItemFields pass through unchanged. Persistence is lossless.

## Final

- **Where did €10.88 first appear?** **Structured pre-bind (inferred Pass C → parseMonetaryLineItems)**
- **Defect in extraction, monetary binding, normalization, or persistence?** **Structured extraction** — downstream stages pass through losslessly
- **1.05 × 10.88 = 11.42 ≠ 13.44**; effective paid = **€12.8/kg**; PDF net = **€9.95/kg**