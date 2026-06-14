# OCR Pipeline — Re-Read Extraction Trace

**Generated:** 2026-06-14  
**Mode:** READ-ONLY investigation  
**Investigator:** subagent `2a783a7f-102a-4a15-bc08-9e241dc583b4`  
**Invoice under test:** Aviludo April · `c2f52357-0f80-491a-ba14-c97ff4837472`

---

## Executive Summary

Re-read always re-executes the full GPT-4.1 vision extraction pipeline. There is no OCR cache, no reuse of prior extraction output, and no short-circuit to deterministic parsers. Each re-read deletes all `invoice_items` (CASCADE deletes matches) and inserts fresh rows with new UUIDs.

---

## End-to-End Flow

```
User clicks Re-read
  │
  ▼
reExtract(row)                              [src/routes/invoices.tsx ~2393]
  │
  ├─ createSignedUrl(row.file_path)         ← fresh signed URL from Supabase storage
  ├─ fetch(signedUrl) → blob → dataUrl
  │
  ▼
runExtraction(invoiceId, dataUrl)           [mutex: extractionInFlightRef]
  │
  ├─ 1. supabase.functions.invoke("extract-invoice")   ← GPT-4.1 vision OCR (4 passes)
  ├─ 2. normalizeInvoiceItemFields + shouldRejectInvoiceIngredientRow filter
  ├─ 3. DELETE invoice_items WHERE invoice_id          ← CASCADE deletes invoice_item_matches
  ├─ 4. INSERT new invoice_items (new UUIDs every time)
  ├─ 5. syncOperationalIngredientCostsFromInvoiceLines
  ├─ 6. await shadowSeedInvoiceItemMatchesAfterExtract (if SHADOW_SEED=true)
  └─ 7. update invoice header (supplier, date, total)
  │
  ▼
loadItems(invoiceId)                        ← virtual matcher when READ_CUTOVER=false
load()
  │
  ▼
UI renders match state
```

---

## Entry Point: `reExtract`

```2393:2403:src/routes/invoices.tsx
  const reExtract = async (row: InvoiceRow) => {
    if (!row.file_path) return;
    if (!isExtractableInvoicePath(row.file_path)) return;
    const ext = row.file_path.split(".").pop()?.toLowerCase() ?? "";
    const { data: signed } = await supabase.storage
      .from("invoices")
      .createSignedUrl(row.file_path, 120);
    if (!signed) return;
    const blob = await fetch(signed.signedUrl).then((r) => r.blob());
    const dataUrl = await fileToExtractionDataUrl(blob, row.file_path.split("/").pop() ?? `invoice.${ext}`);
    const result = await runExtraction(row.id, dataUrl);
```

No branch skips OCR. Same path as initial ingest.

---

## Edge Function: `extract-invoice`

Active pipeline uses OpenAI GPT-4.1 vision in four specialist passes:

```62:68:supabase/functions/extract-invoice/index.ts
    console.log("[invoice-ocr] stage=2 ocr-started", {
      provider: "openai",
      model: "gpt-4.1",
      mode: "vision-json-four-pass",
      passes: ["date-specialist", "supplier-specialist", "footer-totals-specialist", "table-specialist"],
      note: "deterministic OCR parsers (parseContinente/parsePadaria/stages.ts) not invoked",
    });
```

| Pass | Module | Purpose |
|------|--------|---------|
| 1 | `invoice-date-extraction.ts` | Issue date from header crop |
| 2 | `invoice-metadata-extraction.ts` | Supplier name |
| 3 | `invoice-footer-metadata-extraction.ts` | Footer totals |
| 4 | `invoice-table-extraction.ts` | Line items (Anchovas lives here) |

Deterministic parsers (`parseContinente`, `parsePadaria`, `stages.ts`) exist in the codebase but are **not invoked** in the active pipeline.

---

## Post-OCR Processing

After edge function returns:

1. **Normalization** — `normalizeInvoiceItemFields` applies field-level cleanup.
2. **Rejection filter** — `shouldRejectInvoiceIngredientRow` drops non-ingredient rows.
3. **Destructive replace** — `DELETE` all items for invoice, then `INSERT` new rows.
4. **Cost sync** — operational ingredient costs updated from new lines.
5. **Shadow seed** — `shadowSeedInvoiceItemMatchesAfterExtract` awaited when `VITE_MATCH_LIFECYCLE_SHADOW_SEED=true`.
6. **Header update** — supplier, date, total persisted on `invoices` row.

---

## Required Answers

| Question | Answer | Evidence |
|----------|--------|----------|
| **OCR re-run every re-read?** | **YES** | `reExtract` → `runExtraction` → `extract-invoice` every time |
| **Cache reused?** | **NO** | No server or client OCR cache found in codebase |
| **Previous extraction reused?** | **NO** | DELETE + INSERT wipes all prior `invoice_items` and `invoice_item_matches` |

---

## Related Audits

- `.tmp/reread-determinism-investigation/PIPELINE_TRACE.md` — full lifecycle including virtual/persisted split
- `.tmp/anchoas-reread-investigation/INVOICE_TRACE.md` — Anchovas-specific item history
- `.tmp/anchoas-reread-investigation/LIFECYCLE_AUDIT.md` — shadow seed and CASCADE behavior
