# Architecture Recommendation

**Investigation date:** 2026-06-15  
**Type:** Target-state architecture — read-only, no implementation

---

## Target-state layer model

```
┌─────────────────────────────────────────────────────────────┐
│                    Invoice line (raw OCR)                    │
└──────────────────────────┬──────────────────────────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         ▼                 ▼                 ▼
┌────────────────┐ ┌───────────────┐ ┌───────────────────┐
│ Normalization  │ │ Culinary      │ │ Purchase format   │
│ layer          │ │ ontology      │ │ parser            │
│ (token strip,  │ │ (category +   │ │ (existing:        │
│ abbrev expand) │ │ seed rules)   │ │ invoice-purchase- │
│ display-name + │ │               │ │ format.ts)        │
│ identity.ts    │ │               │ │                   │
└───────┬────────┘ └───────┬───────┘ └─────────┬─────────┘
        │                  │                   │
        └────────┬─────────┘                   │
                 ▼                             │
        ┌────────────────────┐                 │
        │ Canonical name     │                 │
        │ generation         │                 │
        │ (deterministic)    │                 │
        │ + confidence       │                 │
        │ + reasoning        │                 │
        └─────────┬──────────┘                 │
                  │                            │
                  ▼                            ▼
        ┌────────────────────┐       ┌──────────────────┐
        │ Catalog row        │       │ Purchase attrs   │
        │ name, normalized_  │       │ qty, unit, price │
        │ name, base_unit    │       │ pack_variant_id  │
        └─────────┬──────────┘       └──────────────────┘
                  │
    ┌─────────────┼─────────────┐
    ▼             ▼             ▼
┌─────────┐ ┌───────────┐ ┌──────────────┐
│ Matching│ │ Recipes / │ │ Price history│
│ pipeline│ │ prep      │ │              │
└─────────┘ └───────────┘ └──────────────┘
                  ▲
        ┌─────────┴──────────┐
        │ User correction loop │
        │ (Review & Create,    │
        │  quality queue,      │
        │  correction memory)  │
        └─────────┬──────────┘
                  ▼
        ┌────────────────────┐
        │ Alias memory       │
        │ (confirmed aliases,│
        │  operational mem)  │
        └────────────────────┘
```

---

## Component responsibilities

| Layer | Responsibility | Extend existing |
|-------|---------------|-----------------|
| **Normalization** | Strip noise tokens, expand abbreviations | `cleanCanonicalIngredientNameForCatalog`, `canonicalizeIngredientIdentity` |
| **Culinary ontology** | Category detection + canonical templates | New; seed from `FAMILY_TOKEN_TO_ID` in `ingredient-identity.ts` |
| **Canonical generation** | Suggested name + confidence + reasoning + stripped/kept attributes | `buildCanonicalIngredientCreateDefaults` |
| **User corrections** | Confirmed name → catalog identity | `buildCatalogIngredientIdentity`, `validateCanonicalIngredientName` |
| **Alias memory** | Invoice text → canonical ID | `ingredient-alias-memory`, `ingredient-correction-memory` |
| **Catalog evolution** | Rename suggestions, pollution review | `canonical-ingredient-quality.ts`, catalog review queues |
| **Pack variants** | Same canonical, different packs/prices | `pack_variant_id` on invoice matches (future) |

---

## Matching vs catalog naming — keep separate

The matcher already uses richer identity (`ingredient-identity.ts`) than catalog cleanup (`canonical-ingredient-display-name.ts`).

**Design rule:** Ontology feeds **both** layers, but catalog names stay shorter and more human-readable than matcher cores. Do not expose matcher tokens in Review & Create UX.

---

## Correction flywheel

```
User confirms canonical in Review & Create
  → Alias stored for invoice wording
  → Corrections feed ingredient-correction-memory
  → Quality queue suggests renames for polluted legacy rows
  → Ontology seed map updated from repeated correction patterns (manual curation)
  → Scorecard re-run before expanding Review & Create scope
```

---

## Phased delivery (design sequence, not implementation plan)

| Phase | Deliverable | Unblocks |
|-------|-------------|----------|
| 1 | Guard UX + herb/produce pass-through | EMPTY rows on Bidfood |
| 2 | Normalization token expansion | WEAK branded/pack lines |
| 3 | Culinary seed ontology | Semantic dairy/egg/cheese |
| 4 | Confidence + reasoning in Review & Create UX | Bulk efficiency |
| 5 | Pack variant architecture | Safe matching expansion |

Re-run catalog quality scorecard after each phase. Gate: **≥55% usable** before Bidfood/Emporio bulk Review & Create.

---

## What not to do

- Do not conflate invoice aliases with catalog names
- Do not rely on LLM for canonical suggestions without breaking determinism and test guarantees
- Do not fold pack-differentiated products (Mozzarella fior di latte 125g vs 2Kg) into one canonical without pack variant layer
- Do not implement ontology before defining attribute classification framework (this design)

---

## Key codebase paths

| Path | Role |
|------|------|
| `src/lib/canonical-ingredient-create.ts` | Review & Create suggestion entry |
| `src/lib/canonical-ingredient-display-name.ts` | Catalog name cleanup |
| `src/lib/ingredient-identity.ts` | Matcher identity (family/form) |
| `src/lib/ingredient-canonical.ts` | Matching pipeline |
| `src/lib/invoice-purchase-format.ts` | Pack/purchase separation |
| `src/lib/ingredient-auto-persist.ts` | Purchase + price persistence |
| `src/lib/canonical-ingredient-quality.ts` | Legacy catalog rename queue |
| `src/components/canonical-ingredient-create-dialog.tsx` | Single-row UX |
| `src/components/bulk-canonical-ingredient-create-sheet.tsx` | Bulk UX |
