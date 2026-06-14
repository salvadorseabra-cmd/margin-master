# Source of Truth Audit — Post Phase 4B Read Cutover

**Mode:** READ-ONLY audit · **Generated:** 2026-06-14

---

## Read Path

When `VITE_MATCH_LIFECYCLE_READ_CUTOVER=true`:

- `persistedMatchByItemId` loaded at invoice load — `invoices.tsx:1081-1089`, `1789-1799`
- Passed to `ItemsTable` — `2791-2794`
- `resolveInvoiceTableRowIngredientMatch` → `resolveReadCutoverMatch` — `invoice-item-match-read-cutover.ts:238-307`
- **Persisted `invoice_item_matches` wins** over virtual matcher when a row exists

Both UI controls read from this single resolution. Neither has its own read path.

---

## Write Path (Still Dual)

| Store | Authoritative for | Written by both paths? |
|-------|-------------------|------------------------|
| `invoice_item_matches` | Read cutover display state | Dual-write (`confirmMatch`/`correctMatch`/`reassignMatch`/`markUnmatched`); confirm/correct/reassign gated by `VITE_MATCH_LIFECYCLE_DUAL_WRITE`; **`markUnmatched` is not gated** |
| `ingredient_aliases` | Legacy matcher + alias auto-confirm | Yes — primary write in `persistIngredientCorrectionForItem` |
| Rejected-pair memory | Blocks rematch after unmatch/reassign-away | Yes |
| Price history | Operational cost | Subtractive cleanup on unmatch/reassign (Phase 5/5B flags) |

---

## Legacy Dependencies (Both Paths)

Both paths still depend on:

- Virtual matcher baseline when cutover off or no persisted row
- `displayState` inference (`ingredient-match-explanation.ts:72-78`)
- Alias map (`confirmedIngredientAliases`) for matching and UI flags

Neither path is alias-only or pre-lifecycle in isolation — MLS dual-write layers on top of alias persist.

---

## Expected SoT

**Primary (display):** `invoice_item_matches` when read cutover ON and row exists.

**Secondary (matching input):** `ingredient_aliases`, reject pairs, virtual matcher fallback.
