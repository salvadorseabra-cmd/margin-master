# Pepino Contamination Audit

**Audited:** 2026-06-14T14:36Z (baseline snapshot)  
**Verdict: CLEAN baseline — no active contamination**

## Results

| Check | Result | Severity |
|-------|--------|----------|
| Orphan `invoice_item_matches` | 0 / 51 | **CLEAN** |
| Duplicate matches per item | 0 | **CLEAN** |
| Stale confirmed Pepino match | None (unmatched) | **CLEAN** |
| Double Bidfood price attribution | 0 rows | **CLEAN** |
| Poison row `a689bd91` | Absent | **REMEDIATED** |
| Conserva history integrity | 2 jar rows, chained | **CLEAN** |
| Obsolete item ID orphans | Old Pepino IDs have no match rows | **CLEAN** |
| Bare "pepino" alias | None | **OK** (matcher may still suggest conserva) |
| Reject pairs | Not in DB | **UNVERIFIED** |

## Detail

### Match coverage

- 51 invoice items, 51 invoice_item_matches
- Zero orphan matches (matches without corresponding items)
- Zero duplicate matches per invoice_item_id

### Pepino-specific

- Current item `aca361a1-ad60-43fa-9cc4-1345b7d45af3`: status `unmatched`
- Obsolete IDs `514feb41…`, `8e9e727a…`: no invoice_items rows, no match rows
- `previous_ingredient_id` tombstones conserva — expected post-unmatch, not active contamination

### Price history

- Bidfood invoice `da472b7f…`: **0** `ingredient_price_history` rows for any ingredient
- Conserva: 2 jar-only rows (Aviludo April + May); no Bidfood attribution
- Poison row `a689bd91-5b83-41d9-b060-b5a63ccfb3b4`: deleted

### Aliases

- 5 jar aliases point to conserva (expected)
- No bare "pepino" alias — matcher may still suggest conserva via fuzzy match

## Conclusion

**No active contamination on baseline.** Prior contamination (poison row, confirmed conserva match on Bidfood Pepino) was remediated by unmatch at `2026-06-14T14:17:26Z`.
