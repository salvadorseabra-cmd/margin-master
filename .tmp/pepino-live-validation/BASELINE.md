# Pepino Live Validation — Baseline Snapshot

**Generated:** 2026-06-14T14:36Z  
**VL project:** bjhnlrgodcqoyzddbpbd  
**Query method:** Supabase service role (read-only)

## Flags (.env.local)

| Flag | Value |
|------|-------|
| VITE_MATCH_LIFECYCLE_SHADOW_SEED | true |
| VITE_MATCH_LIFECYCLE_DUAL_WRITE | true |
| VITE_MATCH_LIFECYCLE_EXTRACT_GATE | default ON |
| VITE_MATCH_LIFECYCLE_READ_CUTOVER | **not set → OFF** |
| VITE_MATCH_LIFECYCLE_SUBTRACTIVE_PRICING | default ON |
| VITE_MATCH_LIFECYCLE_REASSIGN_SUBTRACTIVE | default ON |

## Identifiers (live)

| Entity | ID |
|--------|-----|
| Bidfood invoice | da472b7f-0fd9-4a26-a37c-80ad335f7f7e |
| Pepino line (current) | aca361a1-ad60-43fa-9cc4-1345b7d45af3 |
| Pepino conserva | 635a1189-36ea-4ff2-9012-8172ab1ab81d |
| Poison history (prior) | a689bd91-5b83-41d9-b060-b5a63ccfb3b4 — **absent** |
| Obsolete Pepino items | 514feb41-6cd4-44f1-abc8-344f0c0dfc23, 8e9e727a-1d02-41f7-88e7-8eeea59c8b57 — **absent** |

## Critical baseline finding

The VL DB is **not** in the pre-contamination state from prior audits. Someone (or a prior session) already:

1. **Re-extracted** Bidfood today at `2026-06-14T14:15:54Z` → new Pepino item ID
2. **Unmatched** Pepino at `2026-06-14T14:17:26Z` → subtractive cleanup ran successfully

**Implication:** Manual validation should start from this post-unmatch baseline, or you must re-contaminate (re-confirm match to conserva) before testing reassign.

## invoice_item_matches — Pepino (Bidfood)

| Field | Value |
|-------|-------|
| invoice_item_id | aca361a1-ad60-43fa-9cc4-1345b7d45af3 |
| status | unmatched |
| ingredient_id | null |
| match_kind | null |
| previous_ingredient_id | 635a1189-36ea-4ff2-9012-8172ab1ab81d |
| corrected_at | 2026-06-14T14:17:26.205Z |
| created_at | 2026-06-14T14:15:56.145Z |

## Pepino line details

- Name: "Pepino"
- Quantity: 3.36 kg @ €1.77/kg

## ingredient_price_history — conserva

| id | invoice | supplier | new_price | created_at |
|----|---------|----------|-----------|------------|
| d723199d… | c2f52357… | AVILUDO | 3.665 | 2026-04-17 |
| 5bd9a4e1… | 3b4cb21f… | AVILUDO | 3.748333 | 2026-05-19 |

**No row for Bidfood invoice.**

## ingredients.current_price — conserva

- current_price: 3748.333333333333
- purchase_quantity: 1000, purchase_unit: un
- updated_at: 2026-06-14T14:17:26Z (matches unmatch timestamp)

## ingredient_aliases (pepino-related)

5 confirmed jar aliases → conserva. No alias for bare "pepino".

## Pepino fresco

**Not found** in `ingredients` table.

## Coverage

- invoice_items: 51
- invoice_item_matches: 51
- orphans: 0
- duplicates: 0

## Bidfood price_history

**0 rows** for any ingredient on Bidfood invoice.

## State vs prior audits

Prior contamination timeline (poison row, confirmed match) has been **reversed** by unmatch.  
Bidfood items re-created 2026-06-14T14:15:54Z (11 lines).
