# Root Cause — Produto de Stock

**Date:** 2026-06-15

---

## Classification

| Class | Verdict | Evidence |
|-------|---------|----------|
| **A) OCR / extraction** | **PRIMARY** | Printed in Designação column; GPT inconsistently captures it |
| **B) Parsing** | **SECONDARY** | No post-extraction strip before DB write |
| **C) Persistence** | Pass-through | Stores GPT output faithfully |
| **D) Canonical generation** | **Propagation only** | Keeps tokens; clean input → clean suggestion |
| **E) UI** | Display only | Shows pipeline output |

---

## Exact root cause

Emporio Italia invoices print `Produto de Stock` as a product-type suffix in the Designação column. GPT extraction copies it into `items[].name`. No downstream code removes it. Canonical suggestions inherit it verbatim.

**Not** a canonical generation bug — scorecard with clean inputs produces correct suggestions.
