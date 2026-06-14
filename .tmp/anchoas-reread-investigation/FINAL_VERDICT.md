# Final Verdict — Anchoas Re-Read Investigation

**Generated:** 2026-06-14  
**Investigation:** Why AVILUDO Anchovas line did not auto-rematch after Validation Lab re-read

---

## Verdict

| Field | Value |
|-------|-------|
| **Root cause** | **C — OCR variation broke alias matching** |
| **Should re-read have matched automatically?** | **NO** (with the OCR text actually produced) |
| **Bug?** | **NO** |
| **Recommended fix** | Manually confirm Anchoas on this line (persists alias for `Alconfi sta`), or add fuzzy brand-token normalization so spaced OCR variants (`alconfi sta` ↔ `alconfrisa`) still hit existing aliases |

---

## Key Facts

| Fact | Value |
|------|-------|
| Anchoas ingredient_id | `c811f67f-df4d-4194-ba8b-7a15d4af38bd` |
| Confirmed aliases | 8 |
| Alias for Alconfrisa | ✅ exists |
| Alias for Alconfi sta | ❌ missing |
| Current invoice_item_id | `69d22f75-87a0-430b-926a-ed4be27ce1c5` |
| Current invoice_id | `c2f52357-0f80-491a-ba14-c97ff4837472` |
| Current OCR | `Filete de Anchovas Alconfi sta Lt 495 g` |
| Other 8 lines | Rematched via `confirmed-override`, not aliases |

---

## One-Line Summary

Re-read OCR inserted a space in the brand token (`Alconfrisa` → `Alconfi sta`), producing a lookup key with no persisted alias; semantic fallback scored too low to compensate. Matcher and lifecycle behaved as designed.

---

## Related Deliverables

- [ALIAS_AUDIT.md](./ALIAS_AUDIT.md)
- [INVOICE_TRACE.md](./INVOICE_TRACE.md)
- [MATCHER_TRACE.md](./MATCHER_TRACE.md)
- [REREAD_COMPARISON.md](./REREAD_COMPARISON.md)
- [LIFECYCLE_AUDIT.md](./LIFECYCLE_AUDIT.md)
- [ROOT_CAUSE.md](./ROOT_CAUSE.md)
