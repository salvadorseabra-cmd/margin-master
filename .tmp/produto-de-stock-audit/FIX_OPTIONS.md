# Fix Options — Produto de Stock (No Implementation)

**Date:** 2026-06-15

---

| Location | Risk | Blast radius | Verdict |
|----------|------|--------------|---------|
| Extraction prompt (`invoice-table-extraction.ts`) | Medium — non-deterministic | Emporio extractions | Helpful but insufficient alone |
| **`cleanInvoiceItemDisplayName`** (`invoice-item-fields.ts`) | **Low** | All downstream: matching, aliases, canonical | **RECOMMENDED** — strip `[/\s-]*Produto de Stock\s*$` |
| `COMMERCIAL_PHRASES` + `CATALOG_NOISE_PHRASES` | Low | Normalization + canonical | Defense-in-depth |
| Canonical-only strip | Medium | Review & Create only; aliases still dirty | Too late |
| Crop geometry | High | Text inside Designação cell, not just header | Not sufficient alone |

---

## Recommended approach

1. **Primary:** `cleanInvoiceItemDisplayName` — deterministic, fixes source data for all consumers
2. **Secondary:** Add `produto de stock` to normalization and canonical noise phrase lists
3. **Optional:** Extraction prompt guidance to ignore Emporio boilerplate
