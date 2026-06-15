# Review & Create Future UX

**Investigation date:** 2026-06-15  
**Type:** UX design — read-only, no implementation

---

## Current UX gaps

| Gap | Location | Impact |
|-----|----------|--------|
| Suggestion is preview only; confirmed field empty | `canonical-ingredient-create-dialog.tsx` | 42% EMPTY rows require full manual typing |
| Bulk sheet pre-fills suggestion; single dialog does not | `bulk-canonical-ingredient-create-sheet.tsx` vs dialog | Inconsistent experience |
| No confidence or reasoning | `CanonicalIngredientCreateFormDefaults` has no confidence fields | Users cannot triage 33 rows efficiently |
| No attribute breakdown | Purchase fields separate from name | User does not see why tokens were stripped |
| Alias guard hides good names | `confirmedNameMatchesInvoiceAlias` in `canonical-ingredient-create.ts` | Bidfood herbs show blank |

---

## Design questions — answers

| Question | Recommendation |
|----------|----------------|
| Should user see suggested canonical? | **Yes** — always, including pass-through produce |
| Should user see confidence? | **Yes** — HIGH / MEDIUM / LOW tier |
| Should user see reasoning? | **Yes** — stripped vs kept attributes |
| Should user see attribute breakdown? | **Yes** — collapsible detail panel |
| Should empty suggestions exist? | **No** — replace with "catalog-ready" pre-fill for pass-through categories |
| Should valid produce names auto-populate? | **Yes** — herbs and simple produce pre-fill confirmed field |

---

## Target single-row card

```
┌─────────────────────────────────────────────────────────┐
│ Invoice alias: Manteiga Coimbra s/Sal EMB 1 Kg          │
│ Supplier: Bidfood Portugal                              │
├─────────────────────────────────────────────────────────┤
│ Suggested: Manteiga sem sal              [HIGH ●]       │
│                                                         │
│ Reasoning:                                              │
│   Removed: Coimbra (brand) · EMB (pack) · 1 Kg (bulk)  │
│   Kept: sem sal (unsalted form)                         │
│   Category: Dairy — butter                              │
├─────────────────────────────────────────────────────────┤
│ Confirmed name: [ Manteiga sem sal          ]           │
│ Pack: 1 × kg · €8.90 (from invoice)                     │
│                                                         │
│ [ Use suggestion ]  [ Edit ]  [ Create ingredient ]     │
└─────────────────────────────────────────────────────────┘
```

---

## Pass-through produce (Tomilho)

```
┌─────────────────────────────────────────────────────────┐
│ Invoice alias: Tomilho                                  │
│ Supplier: Bidfood Portugal                              │
├─────────────────────────────────────────────────────────┤
│ ✓ Invoice name is catalog-ready          [HIGH ●]       │
│ Category: Fresh herb                                    │
├─────────────────────────────────────────────────────────┤
│ Confirmed name: [ Tomilho                   ]  ← pre-filled │
│ Pack: 1 × mo · €2.06                                    │
└─────────────────────────────────────────────────────────┘
```

**Validation change (design only):** Allow submit when normalized name ≡ alias **only** for pass-through ontology categories, with explicit user confirmation.

---

## Bulk Review & Create workflow

1. **Sort by confidence** — HIGH first, LOW flagged
2. **Auto-select HIGH** rows for batch create
3. **Show summary bar** — "18 ready · 8 need review · 7 manual"
4. **Block bulk submit** on rows with retained noise tokens (client-side quality gate)
5. **Category chips** — Fresh herb, Produce, Dairy, Eggs, etc.

---

## What NOT to show

- Raw normalization regex output
- Matcher identity tokens (family/form/core) — internal matching concern
- LLM-style prose reasoning — keep deterministic bullet lists

---

## UX principles

1. **Suggestion ≠ confirmation** — user always confirms, but pre-fill aggressively for HIGH confidence
2. **Transparency builds trust** — show what was stripped and why
3. **Empty is failure** — never show blank when a good name exists
4. **Bulk efficiency** — optimize for 33-row Review & Create sessions, not single-row edge cases
5. **Consistent** — single dialog and bulk sheet behave the same way

---

## Success metrics (post-implementation)

| Metric | Today | Target |
|--------|-------|--------|
| Rows requiring full manual name entry | 42% | <15% |
| One-click accept rate (bulk) | ~27% | >55% |
| Time per unmatched row | ~25–40 sec (EMPTY) | ~5–10 sec (pre-filled) |
| Catalog pollution from accepted WEAK suggestions | High risk | Low — quality gate blocks |
