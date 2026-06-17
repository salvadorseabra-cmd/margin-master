# Extraction Trace — Ginger Beer

**Invoice:** `17aa3591-ec98-4c21-89c9-5ae946bc97bb`

---

## Pipeline (Emporio Italia)

| Pass | Stage | Ginger Beer role |
|------|-------|------------------|
| A (2a) | `extractIssueDateFromImage` | None |
| B (2b) | `extractMetadataFromImage` | Supplier → Emporio Italia |
| C (2c) | `extractFooterMetadataFromImage` | Invoice total €327.46 |
| D (2d) | `extractTableItemsFromImage` | **Line item extracted** |

No deterministic OCR parsers on Emporio rows — Pass D GPT-4.1 vision = OCR + JSON.

---

## Values at each stage

| Stage | name | qty | unit | unit_price | total |
|-------|------|-----|------|------------|-------|
| PDF visible | `Baladin - Ginger Beer 0.20cl` | 24 | — | 0.85 | 19.38 |
| GPT Pass D (column-faithful) | same | **24** | un | **0.85** | **19.38** |
| GPT Pass D (case rule) | same | **2** | null | **9.69** or **10.85** | **19.38** |
| `normalizeItems()` | unchanged | — | — | — | — |
| Live DB (`db-record-live.json`) | same | **2** | **cx** | **9.69** | **19.38** |
| Prior upload (`db-record.json`) | same | **24** | **un** | **0.85** | **19.38** |

Product code `BBB-GINGER33ITA` visible on PDF but never stored (`invoice_items` has no `product_code` column).
