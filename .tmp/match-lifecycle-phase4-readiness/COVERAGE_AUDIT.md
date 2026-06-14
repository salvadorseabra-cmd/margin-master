# Phase 4 Read Cutover — Coverage Audit

**Mode:** READ-ONLY audit · **Generated:** 2026-06-14

---

## Write-Path Inventory

| Path | Trigger | Writes `invoice_item_matches`? | Flag / evidence |
|------|---------|-------------------------------|-----------------|
| Extract / re-extract | `shadowSeedInvoiceItemMatchesAfterExtract` | **Yes (if flag ON)** | `invoices.tsx:1466–1473`; gated by `isMatchLifecycleShadowSeedEnabled()` (`match-lifecycle-flags.ts:29–34`, default OFF) |
| Confirm suggested | `confirmIngredientMatch` → `dualWriteMatchLifecycleAfterIngredientPersist` → `confirmMatch` | **Yes (if flag ON)** | `invoices.tsx:1998–2006`; `match-lifecycle-service.ts:38–94` |
| Manual pick | `selectIngredientForItem` | **Yes (if flag ON)** | `invoices.tsx:2049–2057` |
| Correction / reassign | `handleSelectCorrectionIngredient` → `selectIngredientForItem` + lifecycle | **Yes (if flag ON)** | `invoices.tsx:3085–3118`, `187–224` |
| Canonical create | `saveCanonicalIngredientFromInvoice` | **Yes (if flag ON)** | `invoices.tsx:2134–2140` |
| Bulk canonical create | `saveBulkCanonicalIngredientsFromInvoice` | **Yes (if flag ON)** per success | `invoices.tsx:2219–2229` |
| Extract cost sync | `syncOperationalIngredientCostsFromInvoiceLines` | **No** | Phase 3 audit: intentionally not wired |
| Reject pair | `rejectIngredientMatchPair` | **No** | `invoices.tsx:3097–3103`; localStorage only |
| Remove match | — | **No** | `markUnmatched` exists (`match-lifecycle-service.ts:246–298`) but zero UI wiring (Phase 5) |
| Catalog review reassign | `reassignCatalogReviewInvoiceLineMatch` | **No** | `catalog-review-current-matches.ts:186–211`; alias only, no MLS call |
| `markSuggested` | — | **No** | `match-lifecycle-service.ts:181–243`; not wired |

---

## Coverage Percentages

| Scenario | % of lines/actions with persisted records |
|----------|-------------------------------------------|
| **Production today** (both flags OFF) | **0%** — flags default false (`match-lifecycle-flags.ts`) |
| Shadow seed ON, dual-write OFF | **100% at extract** for new/re-extracted lines; **0%** for pre-existing lines until backfill |
| Both flags ON + admin backfill | **~100% line coverage** at rest; **~86% of distinct match-changing action types** wired (6/7: extract seed + 5 invoice flows; missing reject/unmatch + catalog review) |
| Invoice-page user actions only (flags ON) | **5/7 ≈ 71%** of action categories that change effective match (missing reject-pair, remove-match) |

---

## Gaps

1. **Flags OFF** — no runtime writes in default config.
2. **Historical lines** — require `scripts/backfill-invoice-item-matches.mts` (Phase 2 checklist still open).
3. **Catalog review reassign** (`ingredients.review.tsx:439`) — alias persist only; persisted layer stale after cutover.
4. **Reject / unmatch** — `rejectIngredientMatchPair` and session `rejectedMatchItemIds` change matcher input with no MLS write.
5. **Dual-write is fire-and-forget** — MLS failure does not roll back alias persist (`invoices.tsx:187–244`).
6. **Re-extract** deletes all `invoice_items`; match rows cascade-delete via FK; re-seed only if shadow flag ON.
