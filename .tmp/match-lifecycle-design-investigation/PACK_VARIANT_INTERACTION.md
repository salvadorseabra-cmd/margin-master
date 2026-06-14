# Pack Variant Interaction — Lifecycle × Identity Architecture

**Mode:** READ-ONLY architecture analysis · **Generated:** 2026-06-14

---

## Dependency Ordering (Evidence-Based)

From `.tmp/pepino-contamination-timeline/recommendation.json` and `.tmp/ingredient-identity-future-design/executive-summary.json`:

| Rank | Workstream | Rationale |
|------|------------|-----------|
| 1 | **Match lifecycle / persistence workflow (P0)** | Stops pre-review poison regardless of catalog shape |
| 2 | **Matcher guards** (preservation class, token-subset) | Reduces wrong-link recurrence |
| 3 | **Pack Variants P1** | Closes catalog collapse; variant-scoped history chains |

**Key fact:** Pack variants **without** workflow fix: `pack_variants_without_workflow_fix.safe: false` (pepino recommendation).

P0 read guard (`.tmp/identity-guard-design/REPORT.md`) is a **read-path bandage** — does not stop extract-time writes.

---

## North-Star Identity Model (Option E)

From `.tmp/ingredient-identity-future-design/`:

```
ingredient_concept (ingredients)
  └── supplier_product
        └── pack_variant (format-specific: piece, block, jar, kg)
              └── current_price, purchase_quantity
              └── ingredient_price_history (scoped per pack_variant_id)
```

Recipes bind to **concept**; costing reads `default_pack_variant`. Invoice lines match to **pack_variant** (via supplier product) at P1.

---

## How Lifecycle SoT Maps to Pack Variants

Today (lifecycle-first, pre-P1):

```
invoice_items (line facts)
  └── invoice_item_matches (lifecycle SoT)
        ├── ingredient_id (concept)
        ├── status / match_kind / timestamps
        └── (no pack_variant_id yet)

Confirmed match → appendIngredientPriceHistoryFromInvoiceLine(ingredient_id)
Recipe costing → ingredients.current_price
```

After P1 (additive column, no lifecycle rewrite):

```
invoice_items
  └── invoice_item_matches
        ├── ingredient_id (concept — unchanged)
        ├── pack_variant_id (nullable → required for cost sync at P1)
        ├── status / timestamps
        └── previous_ingredient_id / previous_pack_variant_id

Confirmed match → history.append(pack_variant_id)
Recipe costing → concept.default_pack_variant_id → variant.current_price
History chains → scoped per pack_variant_id only
```

The match record is the **stable join point** for identity expansion. P1 adds `pack_variant_id`; lifecycle semantics (suggest, confirm, correct, unmatch) remain unchanged.

---

## Lifecycle First → Simplifies Pack Variants

| P1 concern | Lifecycle-first benefit |
|------------|-------------------------|
| `price_history.pack_variant_id` FK | Match record provides natural per-line anchor |
| Variant-scoped history chains | Unmatch deletes one variant row; reconcile within variant |
| Alias → pack_variant binding | Confirm transition writes alias with variant context |
| Cross-format auto-match poison | Gated sync prevents pre-review writes to wrong variant |
| VL backfill / migration | Match records classify which lines belong to which variant |
| Invoice-item attribution | `invoice_item_id` on match record; history currently lacks this FK |

**Evidence:** `.tmp/identity-expansion-simulation/REPORT.md` — better matching surfaces latent collapse; lifecycle gate prevents eager poison **before** variant split reduces ambiguity.

**Evidence:** `.tmp/recipe-identity-compatibility-audit/future-state-model.json` — invoice path: `invoice_items → match → supplier_product → pack_variant → price_history.append`. Match record is the required middle layer.

---

## Pack Variants First → Does NOT Simplify Lifecycle

| Scenario | Why variants alone are insufficient |
|----------|-------------------------------------|
| **Pepino** | Fresh vs conserva may split to variants OR concepts — extract still writes if match resolves before review |
| **Mozzarella** | Piece vs block variants help catalog — correction still orphans history without subtractive semantics |
| **Ginger Beer** | Volume variant helps identity — latent €575/L if sync runs on wrong parse before confirm |
| **Correction** | Reassign between variants orphans old-variant history row; reconcile not invoked today |
| **Unmatch** | No handler regardless of variant model |

Variants split **formats** but do **not** gate extract sync to a shared parent `ingredient_id` or provide per-line lifecycle reversibility.

---

## Hybrid Sequencing (Design Constraint)

Viable hybrid: **design** match record with nullable `pack_variant_id` now; **production** cost sync to variants only after lifecycle gate ships.

**Do not:**

- Ship P1 auto-sync to `pack_variant_id` before confirmed-match gate
- Run lifecycle + full Option E schema migration in one production cutover (scope creep)

**Do:**

- Ship lifecycle match record with `ingredient_id` first
- Add `pack_variant_id` column when P1 lands
- Reuse same subtractive correction/unmatch semantics at variant scope

---

## Interaction with Aliases and Reject Memory

| Artifact | Today | With lifecycle + P1 |
|----------|-------|---------------------|
| `ingredient_aliases` | Wording → ingredient | Evolves to pack_variant binding + contract snapshot (Option E P2) |
| `rejected-ingredient-matches` | Client localStorage | Server-side reject log or match-record tombstone; variant-aware at P1 |
| Matcher | Resolves to ingredient | Resolves to pack_variant via supplier product resolver |

Lifecycle confirm/correct transitions remain the **write authority** for aliases — aliases stay derived from confirmed matches, not independent SoT.

---

## Answers: Lifecycle vs Variants Ordering

### Does solving Match Lifecycle first simplify Pack Variants?

**Yes (strongly).** Stops pre-review poison regardless of catalog shape; provides `invoice_item_id` FK P1 history needs; defines unmatch/correct before multi-variant complexity.

### Does solving Pack Variants first simplify Match Lifecycle?

**No (weakly / negatively).** Adds migration surface while reversibility remains broken; dual problem (wrong link + wrong format) persists without subtractive semantics.

---

## Reference Documents

- `.tmp/ingredient-identity-future-design/REPORT.md`
- `.tmp/ingredient-identity-future-design/migration-strategy.json`
- `.tmp/identity-guard-design/REPORT.md`
- `.tmp/recipe-identity-compatibility-audit/future-state-model.json`
- `.tmp/pepino-contamination-timeline/recommendation.json`
