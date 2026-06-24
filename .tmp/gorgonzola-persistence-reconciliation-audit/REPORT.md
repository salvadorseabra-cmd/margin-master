# Gorgonzola Invoice Persistence Reconciliation Audit

**Validation Lab:** `bjhnlrgodcqoyzddbpbd` · **Invoice:** `ab52796d-de1d-418d-86e7-230c8f056f09` · **Item:** `bece238e-fd6d-493c-8555-6921b164f97c` · **Read-only** · 2026-06-24

## Required question (A–F)

**C)** Structured extraction

## Required table

| Field | PDF | OCR | Structured | Persisted |
|-------|-----|-----|------------|-----------|
| description | Arrigoni Formaggi - Gorgonzola DOP Dolce Linea Castelregio 1/8 ~1,5kg (GD87813) | Arrigoni Formaggi - Gorgonzola DOP Dolce Linea Castagna 1/8 ~1.5Kg | Arrigoni Formaggi - Gorgonzola DOP Dolce Linea Castelgrotti 1/8 - 1,8-1,9kg | Arrigoni Formaggi - Gorgonzola DOP Dolce Linea Castelfrigo 1/8 - 1,5kg |
| quantity | 1.35 | 1.35 | 1.05 | 1.05 |
| unit | kg | kg | — | kg |
| unit_price | gross €12.90 / net €9.95 | 9.82 | 10.88 | 10.88 |
| discount | 22.85% | not in API response | stripped at API | not stored (schema) |
| line_total | 13.44 | 13.44 | 13.44 | 13.44 |

## T1 — PDF source

| Field | Value |
|-------|-------|
| description | Arrigoni Formaggi - Gorgonzola DOP Dolce Linea Castelregio 1/8 ~1,5kg (GD87813) |
| qty | 1.35 |
| unit | kg |
| unit_price (gross) | €12.9 |
| discount | 22.85% |
| unit_price (net implied) | €9.95 |
| line_total | €13.44 |
| arithmetic | 1.35 × 12.90 × (1 − 0.2285) = 13.44 |
| qty×net=total | **YES** |
| source | .tmp/gorgonzola-root-cause/stage-trace.json visibleInvoice + invoice-table-extraction.ts L107-108 |

## T2 — OCR vs PDF

| Field | PDF | pass-c-raw OCR | v28 API replay |
|-------|-----|----------------|----------------|
| qty | 1.35 | 1.35 | 1.05 |
| unit_price | net €9.95 | 9.82 | 10.88 |
| total | 13.44 | 13.44 | 13.44 |
| qty×price=total | YES | NO | **NO** |

v28 extract matches persisted DB row: **YES**

## T3 — Structured extraction (before normalization)

**PDF-column structured input (prompt example):**
```json
{
  "name": "Arrigoni Formaggi - Gorgonzola DOP Dolce Linea Castelfrigo 1/8 - 1,5kg",
  "quantity": 1.35,
  "unit": "kg",
  "gross_unit_price": 12.9,
  "discount_pct": 22.85,
  "line_total_net": 13.44,
  "unit_price": null,
  "total": null
}
```
After bindMonetaryColumns: qty=1.35, unit_price=9.95, total=13.44, reconciles=true

**DB-matching legacy structured handoff (discount cols null, unit_price pre-filled):**
```json
{
  "name": "Arrigoni Formaggi - Gorgonzola DOP Dolce Linea Castelfrigo 1/8 - 1,5kg",
  "quantity": 1.05,
  "unit": "kg",
  "gross_unit_price": null,
  "discount_pct": null,
  "line_total_net": 13.44,
  "unit_price": 10.88,
  "total": 13.44
}
```
After bindMonetaryColumns: **pass-through** — unit_price=10.88, reconciles=false

## T4 — normalizeInvoiceItemFields

| | quantity | unit | unit_price | total |
|---|----------|------|------------|-------|
| input | 1.05 | kg | 10.88 | 13.44 |
| output | 1.05 | kg | 10.88 | 13.44 |
| changed | **NO** | | | |

## T5 — Persistence payload vs DB

```json
{
  "insertPayload": {
    "invoice_id": "ab52796d-de1d-418d-86e7-230c8f056f09",
    "name": "Arrigoni Formaggi - Gorgonzola DOP Dolce Linea Castelfrigo 1/8 - 1,5kg",
    "quantity": 1.05,
    "unit": "kg",
    "unit_price": 10.88,
    "total": 13.44
  },
  "dbRow": {
    "id": "bece238e-fd6d-493c-8555-6921b164f97c",
    "invoice_id": "ab52796d-de1d-418d-86e7-230c8f056f09",
    "name": "Arrigoni Formaggi - Gorgonzola DOP Dolce Linea Castelfrigo 1/8 - 1,5kg",
    "quantity": 1.05,
    "unit": "kg",
    "unit_price": 10.88,
    "total": 13.44,
    "created_at": "2026-06-23T10:41:31.22202+00:00",
    "updated_at": "2026-06-23T10:41:31.22202+00:00",
    "user_id": "acfb54e5-785f-4bc8-b47b-3914452e18a5"
  },
  "matches": true
}
```

## T6 — Reconciliation table (pipeline stages)

| Stage | qty | unit_price | total | qty×price | reconciles? |
|-------|-----|------------|-------|-----------|-------------|
| PDF | 1.35 | 9.95 | 13.44 | 13.43 | YES |
| OCR / extract-invoice API (pass-c-raw) | 1.35 | 9.82 | 13.44 | 13.26 | **NO** |
| Structured / API output (v28 deploy replay) | 1.05 | 10.88 | 13.44 | 11.42 | **NO** |
| Structured (pre-bind replay: PDF columns) | 1.35 | 12.9 | 13.44 | — | n/a |
| After bindMonetaryColumns (PDF structured) | 1.35 | 9.95 | 13.44 | 13.43 | YES |
| Structured (pre-bind: DB legacy fields) | 1.05 | 10.88 | 13.44 | 11.42 | **NO** |
| After bindMonetaryColumns (DB legacy) | 1.05 | 10.88 | 13.44 | 11.42 | **NO** |
| After normalizeInvoiceItemFields | 1.05 | 10.88 | 13.44 | 11.42 | **NO** |
| Persistence insert payload | 1.05 | 10.88 | 13.44 | 11.42 | **NO** |
| Persisted invoice_items (DB) | 1.05 | 10.88 | 13.44 | 11.42 | **NO** |

**First stage where qty×price≠total (any values):** **OCR / extract-invoice API (pass-c-raw)**
**First stage with persisted trio (1.05/10.88/13.44):** **Structured / API output (v28 deploy replay)** (.tmp/final-validation-lab-rerun-v28/extracts/17aa3591.json deploy v28)

## T7 — Discount handling (deli controls)

| Product | qty | unit_price | total | qty×price | reconciles? |
|---------|-----|------------|-------|-----------|-------------|
| Arrigoni Formaggi - Gorgonzola DOP Dolce… | 1.05 | 10.88 | 13.44 | 11.42 | NO |
| Assaporami Prosciutto Cotto Scelto HC 4,… | 4.3 | 8.5 | 36.54 | 36.55 | YES |
| Rovagnati - Mortadella IGP 'Massima' con… | 3.11 | 9.99 | 31.07 | 31.07 | YES |
| Rigamonti - Bresaola Punta d'Anca Oro 1/… | 1.83 | 27.04 | 49.48 | 49.48 | YES |

**Prosciutto / Mortadella / Bresaola reconcile?** **YES**

bindMonetaryColumns discount replays:
- **pdf_gross_discount_qty_1_35** → unit_price=9.95, reconciles=true
- **pdf_gross_discount_db_qty_1_05** → unit_price=9.95, reconciles=false
- **legacy_db_no_discount_cols** → unit_price=10.88, reconciles=false

## T8 — Root cause

**C)** PDF is consistent (1.35×12.90×0.7715=13.44). Persisted trio qty=1.05, unit_price=10.88, total=13.44 (1.05×10.88=11.42≠13.44) first appears at extract-invoice API output (v28 deploy replay ≡ DB bece238e). normalizeInvoiceItemFields and insert payload are lossless. bindMonetaryColumns pass-through when discount cols null and total>qty×unit_price; applyEffectivePaidPrice does not fire.

## Ingredient → detail trace

| Stage | Value |
|-------|-------|
| invoice_items | qty=1.05, unit_price=10.88, total=13.44 |
| operationalCostFieldsFromInvoiceLine | {"current_price":10.88,"purchase_quantity":1000,"cost_base_unit":"g"} |
| ingredients.current_price | 10.88 |
| detail procurement | €10.88 / kg |
| detail total paid | €13.44 |

## Final

- **Exact stage persisted trio (1.05/10.88/13.44) first appears:** **Structured / API output (v28 deploy replay)**
- **Most likely wrong value:** **unit_price** (persisted unit_price €10.88 ≠ PDF net €9.95, ≠ effective-paid €12.80/kg)
- **PDF is arithmetically consistent; persistence is lossless; defect originates in GPT Pass C / extract-invoice structured output (v28 replay ≡ DB).**