# Final Recommendation — Non-Ingredient Invoice Lines

**Date:** 2026-06-15

## Should operational charges appear in Review & Create?

**No.** Current design is correct for Recargo:
- Review & Create creates catalog ingredients
- Fuel surcharges are invoice-level costs, not kitchen identities

## Recommended follow-ups (guidance only)

1. **Keep excluding** fuel surcharge from Review & Create — already done
2. **Extend blocklist** if production shows delivery/pallet/deposit/environmental patterns
3. **Invoice Review UX:** Label fee lines as "Operational charge — not an ingredient"; exclude from unmatched count
4. **Single-row create:** Disable "Create ingredient" when `isNonFoodInvoiceLine` is true

## Summary

| Question | Answer |
|----------|--------|
| Intentional exclusion? | **Yes** |
| Classification | Fuel surcharge / non-food |
| Code path | `collectUnmatchedRowsForBulkCreate` → `isNonFoodInvoiceLine` |
| Accidental? | **No** |
