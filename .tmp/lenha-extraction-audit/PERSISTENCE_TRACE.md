# Persistence Trace — Lenha Invoice

**Date:** 2026-06-15

## Scenario: **C — AI never extracted usable line items**

```
Pass D crop excludes product row
  → GPT returns items: []
  → runExtraction: normalizedItems.length === 0
  → returns null
  → toast: "Extraction returned no line items — existing rows kept"
  → no DELETE/INSERT on invoice_items
  → header update skipped (total stays €0)
```

**Not A** (UI lost persisted item) or **B** (client filter removed item).

Secondary bug: when `runExtraction` returns null, invoice header (total €75) is not updated even though edge function returned it.
