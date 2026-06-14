# Final Recommendation — Match UI Consolidation

**Mode:** READ-ONLY audit · **Generated:** 2026-06-14

---

## Question Answered

Are "Matched to" and "Correct match":

| Option | Verdict |
|--------|---------|
| A) Same flow, two entry points | **Yes** |
| B) Different flows, different persistence | **No** |
| C) One legacy path obsolete | **Partially — "Correct match" link is redundant opener** |

---

## FINAL VERDICT

### `CONSOLIDATE_TO_MATCHED_TO`

**Evidence:** Both labels converge on one `InvoiceIngredientCorrectionPicker` and identical post-selection handlers. "Correct match" is a redundant opener with worse snapshot metadata (`wasConfirmed` omitted), not a second persistence path.

---

## UX Options

| Option | Risk | Assessment |
|--------|------|------------|
| **A: Keep both** | Medium | Duplicate controls; link path leaves `wasConfirmed=false` for confirmed rows → wrong MLS transition and weaker subtractive pricing |
| **B: Keep only Matched to (chip), remove Correct match** | **Lowest** | Chip covers all states; preserves `wasConfirmed`; Confirm match stays for suggested |
| **C: Keep Correct match, remove chip** | High | Loses readable match label; worse UX |

---

## Recommended Minimal Change (Option B)

1. Remove `showWrongMatch` / `onOpenCorrection` / Correct match link from `IngredientCorrectionActions` (or stop rendering the link in `ItemsTable`).
2. Keep `Confirm match` for suggested rows.
3. Optionally delete unused `INVOICE_INGREDIENT_CORRECTION_NO_MATCH` sentinel.
4. If keeping both temporarily: fix `onOpenCorrection` to pass `wasConfirmed: ingredientMatchState.displayState === "confirmed"`.

---

## Cross-References

- `MATCHED_TO_TRACE.md`
- `CORRECT_MATCH_TRACE.md`
- `FLOW_COMPARISON.md`
- `SOURCE_OF_TRUTH_AUDIT.md`
- `DEAD_CODE_AUDIT.md`
