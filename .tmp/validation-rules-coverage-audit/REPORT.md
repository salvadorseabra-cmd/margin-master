# Validation Rules Coverage Audit

**Validation Lab:** `bjhnlrgodcqoyzddbpbd`  
**Mode:** READ-ONLY — no code changes  
**Date:** 2026-06-25  
**Scope:** Full validation system from OCR → `invoice_items` → invoice review UI → operational costing

---

## Executive Summary

Marginly’s invoice **“Needs review”** system is narrowly scoped to **extraction completeness** and **row-level monetary self-consistency** (`qty × unit_price` vs `total`). It does **not** validate stock normalization, operational cost, procurement semantics, or PDF ground truth after persist.

- **Guanciale** passes every implemented review gate because invoice-row math is correct (5.996 × €10.83 ≈ €64.93); the bug lives in **stage-8 stock normalization** (10.5 kg usable vs ~6 kg), which has **no review rule**.
- **Gorgonzola** is a **dual-state** case: the canonical bad triple (1.05 × 10.88 ≠ 13.44) **would** trigger `MATHEMATICAL_RECONCILIATION_FAILURE`, but the **current persisted triple** (1.30 × 9.88 vs 13.44, variance 4.46%) **falls below the 5% AND €0.50 gate** and passes silently. No rule compares extracted values to PDF/OCR truth on reload.
- **Coverage:** ~7 checklist items implemented with review UI, ~13 partial, ~6 missing. The largest gaps are **operational/procurement economics**, **package-multiplier sanity**, and **post-normalization validation**.

---

## Proven Facts

| # | Fact | Evidence |
|---|------|----------|
| 1 | `needsExtractionConfirmation` is the sole gate for row-level “Needs review” highlighting and header badge | `src/routes/invoices.tsx` L527–535, L3414–3415, L3486–3499, L3775 |
| 2 | Review reasons are **detection-only** — no persist block, no costing mutation | `src/lib/invoice-extraction-review.ts` header comment; mathematical-reconciliation-implementation REPORT |
| 3 | Mathematical review flags when `variance_abs > €0.50` **AND** `variance_pct > 5%` | `src/lib/invoice-extraction-review.ts` L7–8, L90–99 |
| 4 | Guanciale persisted row: qty=5.996, unit_price=10.83, total=64.93 → variance €0.01 (0.02%) → **math review false** | Node replay; `.tmp/quantity-mismatch-ui-audit/replay.json`; `.tmp/mathematical-consistency-coverage-audit/results.json` |
| 5 | Guanciale usable stock normalized to **10 500 g** (10.5 kg), operational cost **€6.18/kg** vs expected **~€10.83/kg** | `.tmp/guanciale-readiness-audit/REPORT.md`; `.tmp/quantity-mismatch-ui-audit/replay.json` L657–694 |
| 6 | Guanciale extraction stages 1–7 preserve qty/total; first wrong value at **stage 8** stock normalization | `.tmp/guanciale-readiness-audit/REPORT.md` stage trace |
| 7 | Gorgonzola VL row `bece238e` (invoice `ab52796d`): 1.05 × 10.88 = 11.42 ≠ 13.44 (15.03%) → **math review true** | `.tmp/mathematical-consistency-coverage-audit/results.json` L682–695; `needsMathematicalReconciliationReview` replay |
| 8 | Gorgonzola **re-extracted** row (final-gorgonzola-validation): 1.30 × 9.88 = 12.84 ≠ 13.44 (4.46%) → **math review false** | `.tmp/final-gorgonzola-validation/REPORT.md` T3; node replay |
| 9 | Gorgonzola PDF truth 1.35 × 9.95 ≈ 13.44 reconciles (0.07%) — extraction qty/unit_price wrong, not line total | `.tmp/final-gorgonzola-validation/REPORT.md`; `.tmp/gorgonzola-mathematical-trace-audit/REPORT.md` |
| 10 | `extraction_meta` (OCR qty anchoring) is **not persisted to DB**; only held in React session state after fresh extract | `src/routes/invoices.tsx` L1401–1407, L1560–1566; `.tmp/gorgonzola-hardening-implementation/REPORT.md` L55–56 |
| 11 | `applyEffectivePaidPrice` only fires when `total < qty × unit_price` (gross-over-net); inverse failures pass through | `invoice-monetary-binding.ts` L109–129; `.tmp/mathematical-consistency-coverage-audit/REPORT.md` Task 6 |
| 12 | `reconcileLineItemAmounts` **preserves** inconsistent rows when both `unit_price` and `total` present | `invoice-line-reconcile.ts` L68–76 |
| 13 | No persist-time `qty × unit_price ≈ total` validation exists | `.tmp/mathematical-consistency-coverage-audit/REPORT.md` Task 6 |
| 14 | Invoice list “Needs review” (`baseStatus === "Review"`) means **zero items and zero total** — not extraction quality | `src/routes/invoices.tsx` L484 |
| 15 | Quantity-mismatch internal scan flagged 19/51 rows; only 4 are user-visible bugs (incl. Guanciale) | `.tmp/quantity-mismatch-validation/REPORT.md`; `.tmp/quantity-mismatch-ui-audit/REPORT.md` |

---

## Part 1 — Validation Rule Inventory

### Invoice extraction pipeline (Edge Function)

| Rule name | File | Trigger condition | Severity | UI location | Purpose |
|-----------|------|-------------------|----------|-------------|---------|
| Footer arithmetic (net + VAT = total) | `invoice-footer-metadata-parse.ts` `validateFooterMetadataArithmetic` | `|net_subtotal + vat − total| > €0.02` | Log warning; `confidence: low` | None (console `[invoice-ocr] footer-totals-validation`) | Validate footer OCR; does not block persist |
| Non-item line filter | `stages.ts` `filterNonItemLines` | Payment/header/summary patterns | Row dropped | N/A | Exclude non-product lines from extraction |
| Continente hard reject | `parseContinente.ts` `shouldHardRejectContinenteLine` | Supermarket noise patterns | Row dropped | N/A | Legacy parser guard (not active 4-pass pipeline) |
| Qty prepass OCR vs Pass C disagreement | `invoice-qty-prepass.ts` `anchorQuantities` / `applyFractionDescriptionConflict` | Δ > 10% between OCR qty and Pass C qty; fraction-description conflict | Metadata `ocr_qty_mismatch: true` | Invoice row badge **only if** `extraction_meta` in session | Flag qty disagreement; anchoring may override qty |
| Qty anchoring (Emporio fractional kg) | `invoice-qty-prepass.ts` `anchorQuantities` | OCR score beats Pass C by €0.10 or math fails + OCR score ≤ €0.50 | Quantity overwritten at extract | None directly | Correct qty before persist |
| Structured monetary binding (Rules B, E, F) | `invoice-monetary-binding.ts` `bindMonetaryColumns` | Discount % read as price; neighbour bleed; gross×discount≠net | Rebind `unit_price`/`total` | None | Fix common OCR monetary misreads |
| Effective paid price rebind | `invoice-monetary-binding.ts` `applyEffectivePaidPrice` | `total < qty × unit_price − €0.02` (no discount %) | `unit_price := total ÷ qty` | None | Net unit price when gross column used |
| Line amount fill | `invoice-line-reconcile.ts` `reconcileLineItemAmounts` | Missing `unit_price` OR missing `total` | Derive missing column | Indirect via `needsAmountConfirmation` | Fill single missing amount |
| Line amount preserve | `invoice-line-reconcile.ts` L75–76 | Both `unit_price` and `total` present | **No change** even if inconsistent | None | Preserve discount-line math |
| Net subtotal OCR slip fix | `invoice-line-reconcile.ts` `reconcileLineItemsToNetSubtotal` | Line sum below net subtotal by €0.50 or €1 on single sub-€10 pack | Adjust one row price | None | Fix lone leading-digit OCR slip |
| Payment/metadata row reject | `invoice-item-fields.ts` `shouldRejectInvoiceIngredientRow` | Cartão, IVA total, IBAN, etc. | Row excluded from persist | N/A | Keep non-ingredient lines out of catalog flow |
| Row tail qty/unit parse | `invoice-item-fields.ts` `normalizeInvoiceItemFields` | Qty/unit embedded in product name tail | Backfill null fields | Indirect | Recover qty/unit from name OCR |

### Invoice review UI (client)

| Rule name | File | Trigger condition | Severity | UI location | Purpose |
|-----------|------|-------------------|----------|-------------|---------|
| **Needs review (row)** | `invoices.tsx` `needsExtractionConfirmation` | Any sub-check below | `review` tone; amber row bg | Invoice detail table row + header badge | Aggregate extraction review |
| Placeholder item name | `invoices.tsx` `isPlaceholderItemName` | Empty or `"unknown"` name | Review | Row highlight | Flag unusable extraction |
| Missing quantity/unit | `invoices.tsx` `needsQuantityUnitConfirmation` | Missing qty or unit AND no `hasClearInferredQuantityUnit` | Review | Header “N need quantity check” | Flag incomplete row |
| Missing amount | `invoices.tsx` `needsAmountConfirmation` | `unit_price == null` OR `total == null` | Review (via extraction) | Row highlight | Flag incomplete pricing |
| **Mathematical reconciliation** | `invoice-extraction-review.ts` `needsMathematicalReconciliationReview` | `variance_abs > €0.50` AND `variance_pct > 5%` | Review + “Math mismatch” badge | Invoice row inline badge | Flag qty×price≠total |
| **OCR quantity mismatch** | `invoice-extraction-review.ts` `needsOcrQtyMismatchReview` | `extraction_meta.ocr_qty_mismatch === true` | Review + “OCR qty mismatch” badge | Invoice row (session meta only) | Flag OCR vs Pass C disagreement |
| Unmatched ingredient | `invoice-unresolved-ingredient-count.ts` | `displayState === "unmatched"` | Warning on invoice list | Invoice list + row match picker | Catalog normalization |
| Possible/suggested match | `invoice-ingredient-row-display.ts` | `displayState === "suggested"` | Review chip | Row match UI | Ambiguous ingredient |
| Confirmed auto-match | `deriveInvoiceRowInlineChips` | High-confidence match, no review flags | Success chip | Row inline | Positive signal |
| Price spike (pack unit_price) | `invoice-purchase-price-semantics.ts` `formatInvoiceRowReviewWarning` | Unit price up vs previous invoice line | `increase` chip | Row inline “Price spike” | Historical **pack** price movement |
| New supplier chip | `formatInvoiceRowReviewWarning` | Supplier changed signal | Muted chip | Row inline | Supplier change notice |
| Invoice list “Needs review” | `invoice-unresolved-ingredient-count.ts` `deriveInvoiceListIngredientStatus` | `baseStatus === "Review"` (no items) | List badge | Invoice list | Empty extraction only |

### Stock normalization / operational (no review flags)

| Rule name | File | Trigger condition | Severity | UI location | Purpose |
|-----------|------|-------------------|----------|-------------|---------|
| Impossible usable quantity | `invoice-purchase-format.ts` `isImpossibleUsableQuantity` | >500 kg/L or >10k units | Suppress usable display | Ingredient detail (null stock) | Hide absurd values |
| Collapsed meaningless usable | `invoice-purchase-format.ts` `isCollapsedMeaninglessUsable` | 1 g/ml/un with low confidence | Suppress + lower confidence | Ingredient detail | Hide weak 1-unit collapse |
| Purchase format confidence | `invoice-purchase-format.ts` / `stock-normalization.ts` | Parser confidence thresholds | Internal only | None | Drive display fallbacks |
| Stock normalize logging | `stock-normalization.ts` `logStockNormalize` | Pipeline steps | DEV console only | None | Diagnostics |

### Catalog / operational review queue (not invoice-line)

| Rule name | File | Trigger condition | Severity | UI location | Purpose |
|-----------|------|-------------------|----------|-------------|---------|
| Unmatched invoice ingredients | `operational-review-queue.ts` | Unmatched lines across invoices | high/medium | Dashboard review queue | Catalog hygiene |
| Low-quality canonical names | `canonical-ingredient-naming-queue.ts` | High-confidence rename suggestions | medium | Naming review section | Catalog quality |
| Duplicate canonical risk | `ingredient-identity-diagnostics.ts` | Operational duplicate clusters | medium | Ingredients list filter | Merge candidates |
| Orphan canonical ingredients | `ingredient-orphan-detection.ts` | No aliases/recipes | low | Review queue | Unused catalog |
| Catalog confirmation pending | `ingredient-pricing-freshness.ts` | Purchase without pack refresh | medium | Pricing queue | Stale catalog vs invoice |
| Stale catalog prices | `ingredient-pricing-freshness.ts` | 90+ days without pricing signal | medium | Stale prices queue | Pricing freshness |
| Alias integrity audit | `ingredient-alias-integrity-audit.ts` | Low token similarity / category mismatch | Badge in catalog review | Catalog review | Suspicious alias mappings |

### Margin / historical (downstream, not invoice review)

| Rule name | File | Trigger condition | Severity | UI location | Purpose |
|-----------|------|-------------------|----------|-------------|---------|
| Price increase alert | `margin-alert-data.ts` | Ingredient price up vs history | Alert card | Margin alerts / OI | Post-ingest economics |
| Price decrease alert | `margin-alert-data.ts` | Price down vs history | Alert card | Margin alerts | Savings signal |
| Ingredient inflation spike | `margin-alerts.ts` | Rapid price rise window | Critical alert | Dashboard | Trend anomaly |
| Supplier anomalies | `margin-alert-data.ts` | Supplier trend outliers | Section | OI supplier section | Supplier intelligence |
| Pricing freshness levels | `ingredient-pricing-freshness.ts` | 30/60/90/180 day tiers | Badge on ingredient | Ingredient detail | Recency signal |

---

## Part 2 — Guanciale Trace

**Invoice:** `36c99d19-6f9f-413f-8c2d-ae3526291a2d` (Mammafiore)  
**Item:** `6efebedf-c78e-46c1-9ae1-58792229834b`  
**Persisted:** qty=5.996, unit=`un`, unit_price=10.83, total=64.93

| Validation rule | Executed? | Result | Why |
|-----------------|:---------:|:------:|-----|
| Footer arithmetic | At extract only | N/A on review | Not re-evaluated on invoice open |
| Qty prepass / OCR mismatch | Only on fresh extract | **Skipped** | `extraction_meta` not in DB; empty on page load |
| Monetary binding | At extract | **Passed** | Net unit_price 10.83 bound correctly |
| `reconcileLineItemAmounts` | At extract | **Passed** | All three columns present; preserved |
| `applyEffectivePaidPrice` | At extract | **Skipped** | `total > qty×unit_price` (inverse failure mode) |
| Placeholder name | On review render | **Passed** | Valid product name |
| Missing qty/unit | On review render | **Passed** | qty=5.996, unit=`un` present |
| Missing amount | On review render | **Passed** | unit_price and total present |
| **Mathematical reconciliation** | On review render | **Passed** | 5.996×10.83=64.94 vs 64.93 → €0.01 (0.02%) |
| OCR qty mismatch review | On review render | **Skipped** | No session `extraction_meta` |
| Unmatched ingredient | On review render | Depends on match state | Not an extraction issue |
| Stock normalization | On display/persist | **Failed silently** | `*7 × 1.5 kg` → 10 500 g usable (should ~5 996 g) |
| Impossible usable | On display | **Passed** | 10.5 kg within thresholds |
| Operational cost check | — | **Not implemented** | €6.18/kg vs €10.83/kg undetected |
| Procurement cost check | — | **Not implemented** | €10.83/unit label vs weight line undetected |
| Quantity-mismatch scan | Offline audit only | **Flagged** | 5 internal mismatch types; no UI review flag |

**Guanciale root cause (one sentence):** Invoice-row extraction and monetary validation are internally consistent, but **no validation rule inspects stock normalization or operational cost**, so the stage-8 `SIZE_COUNT_RE` over-count (10.5 kg usable, €6.18/kg) never surfaces as “Needs review.”

---

## Part 3 — Gorgonzola Trace

**Invoice:** `ab52796d-de1d-418d-86e7-230c8f056f09` (Emporio)  
**Item:** `bece238e-fd6d-493c-8555-6921b164f97c` (VL corpus) / `fd785aba` (post re-extract per final-gorgonzola-validation)

### State A — Canonical bad triple (VL mathematical audit)

| Field | Value |
|-------|------:|
| quantity | 1.05 kg |
| unit_price | 10.88 |
| total | 13.44 |
| qty × unit_price | 11.42 |
| variance | €2.02 (15.03%) |

| Validation rule | Executed? | Result | Why |
|-----------------|:---------:|:------:|-----|
| Structured discount binding | At extract | **Skipped** | `gross_unit_price` / `discount_pct` stripped at persist |
| `applyEffectivePaidPrice` | At extract | **Skipped** | Requires `total < qty×unit_price`; here total **>** product |
| `reconcileLineItemAmounts` | At extract | **Preserved bad triple** | Both columns present → no fix |
| **Mathematical reconciliation** | On review render | **Would FAIL** | €2.02 > €0.50 AND 15.03% > 5% |
| OCR qty mismatch | On fresh extract only | **Context-dependent** | Anchoring may set `ocr_qty_mismatch: false` when OCR wins |
| Persist-time math block | — | **Not implemented** | Row saved despite inconsistency |

### State B — Current re-extracted triple (final-gorgonzola-validation)

| Field | PDF | Persisted |
|-------|----:|----------:|
| quantity | 1.35 | **1.30** |
| unit_price | 9.95 | **9.88** |
| total | 13.44 | 13.44 |
| qty × unit_price variance | €0.01 (0.07%) | **€0.60 (4.46%)** |

| Validation rule | Executed? | Result | Why |
|-----------------|:---------:|:------:|-----|
| **Mathematical reconciliation** | On review render | **Passed** | 4.46% < 5% threshold (AND gate) |
| OCR qty mismatch | Session only | **Unavailable** | Meta not persisted; page reload loses flag |
| PDF ground-truth check | — | **Not implemented** | No validator compares to gross/discount columns or OCR |
| Operational cost check | — | **Not implemented** | kg row: procurement = operational = €10.88/kg (degenerate) |

**Gorgonzola root cause (one sentence):** The mathematical validator only checks **self-consistency of the persisted triple** (and misses the current 4.46% case due to the dual AND threshold), while **no rule validates extraction against PDF/OCR truth or persists `extraction_meta`**, so wrong qty/unit_price combinations that keep `total` plausible pass without “Needs review.”

---

## Part 4 — Coverage Audit vs Restaurant Invoice Checklist

| Checklist item | Status | Notes |
|----------------|:------:|-------|
| OCR confidence | **Partial** | Footer `confidence: low`; purchase-format confidence internal only |
| Missing quantity | **Implemented** | `needsQuantityUnitConfirmation` |
| Missing unit | **Implemented** | Bundled with quantity check + inference fallback |
| Unknown unit | **Partial** | Generic `un` accepted; no review flag for unrecognized units |
| Unknown supplier | **Partial** | Filename fallback; no review flag |
| Unknown ingredient | **Implemented** | Unmatched + list warning |
| Ambiguous match | **Implemented** | Suggested match workflow |
| Duplicate match | **Partial** | Alias integrity in catalog review only |
| Quantity reconstruction mismatch | **Partial** | OCR mismatch flag; session-only, Emporio kg scope |
| Package multiplier mismatch | **Missing** | Guanciale `*7` error undetected |
| Quantity × Unit Price ≠ Line Total | **Partial** | Implemented with AND threshold; no persist block; misses 4.46% case |
| Operational Cost inconsistent | **Missing** | Guanciale €6.18/kg vs €10.83/kg silent |
| Procurement Cost inconsistent | **Missing** | No cross-check vs invoice economics |
| Impossible usable quantity | **Partial** | Suppresses display only (500 kg ceiling) |
| Impossible package size | **Missing** | No review rule |
| Historical price anomaly | **Partial** | Margin alerts post-ingest; not invoice review |
| Extreme operational price deviation | **Partial** | “Price spike” is pack `unit_price` only, not €/kg operational |
| Invoice total mismatch | **Partial** | Footer at extract; header vs line sum not in review UI |
| VAT inconsistency | **Partial** | Footer validation logged only |
| Discount inconsistency | **Partial** | Binding rules at extract; discounted rows intentionally preserved |
| Duplicate invoice | **Missing** | No detector in production path |
| Negative values | **Missing** | No explicit validation |
| Zero values | **Partial** | `qty <= 0` skips math review |
| Impossible conversions | **Partial** | `isImpossibleUsableQuantity` threshold suppress only |

### Coverage counts

| Status | Count |
|--------|------:|
| **Implemented** | 7 |
| **Partial** | 13 |
| **Missing** | 6 |

---

## Part 5 — Architectural Assessment (Invoice Editing Readiness)

| Capability | Mathematical review | OCR qty mismatch | Missing field checks | Operational/stock rules |
|------------|:-------------------:|:----------------:|:--------------------:|:-----------------------:|
| Specific reason code | ✅ `MATHEMATICAL_RECONCILIATION_FAILURE` | ✅ `OCR_QUANTITY_MISMATCH` | ❌ generic highlight | ❌ N/A |
| Affected field | ✅ implied (qty, unit_price, total) | ✅ metadata (ocr vs pass_c) | ⚠️ partial | ❌ |
| Suggested correction | ❌ | ❌ | ❌ | ❌ |
| Confidence | ✅ variance_abs/pct in metadata | ✅ delta_pct | ❌ | ❌ |
| Severity | ⚠️ binary review tone | ⚠️ binary review tone | ⚠️ same bucket | ❌ |
| Survives page reload | ✅ (persisted fields) | ❌ session meta only | ✅ | ❌ |

**Verdict:** Architecture is **insufficient** for a human correction workflow on economics bugs. Existing reasons are **too generic** for field-level editing (no suggested values, no severity gradation, no stock/operational dimension). The `InvoiceExtractionReviewReason` type is a good seed but covers only two codes and does not extend to normalization.

**Smallest architectural additions (recommendation-aligned):**

1. **Persist `extraction_meta`** (or review snapshot JSON) on `invoice_items` so OCR mismatch survives reload.
2. **Add `OPERATIONAL_ECONOMICS_MISMATCH`** reason: `|line_total ÷ normalized_usable − displayed_operational_cost| > threshold` OR `total ÷ qty` vs `unit_price` for weight lines.
3. **Add `PACKAGE_STRUCTURE_MISMATCH`**: row qty×pack_size from name vs `normalizedUsableQuantity`.
4. **Relax math gate** to OR logic or lower pct threshold when `variance_abs > €0.50` (catches Gorgonzola 4.46%).
5. **Extend reason type** with `affectedFields: string[]` and `suggestedValues: Record<string, number>` for edit UI.

---

## Blast Radius

**High**

- Guanciale-style bugs corrupt **operational cost**, **usable stock**, and **recipe costing** silently for matched ingredients.
- Gorgonzola-style bugs corrupt **persisted unit_price** and **ingredient economics** with no review surfacing on current triple.
- Mathematical guardrail catches only **1/52** VL rows at historical 1.05/10.88 state; **0/52** at current 1.30/9.88 state.
- Quantity-mismatch scan finds **19/51** internal inconsistencies; **4** user-visible — internal signals are not wired to review UI.

---

## Recommendation

**No broad implementation in this audit.** Smallest high-value architectural additions:

1. **Persist extraction review metadata** on ingest (unblocks OCR mismatch on reload).
2. **Add post-normalization economics validator** (line total ÷ usable vs operational cost; catches Guanciale).
3. **Tighten mathematical gate** (OR threshold or `total ÷ qty` vs `unit_price` for kg/un weight lines; catches Gorgonzola 4.46% and inverse discount failures).
4. **Do not redesign procurement/operational pipelines** — upstream validation at review boundary is sufficient (per procurement-vs-operational-cost-audit).

---

## Cross-References

| Artifact | Use |
|----------|-----|
| `.tmp/guanciale-readiness-audit/REPORT.md` | Stage-8 root cause |
| `.tmp/quantity-mismatch-ui-audit/REPORT.md` | Guanciale class A user-visible bug |
| `.tmp/mathematical-consistency-coverage-audit/REPORT.md` | Gorgonzola 15.03% corpus scan |
| `.tmp/final-gorgonzola-validation/REPORT.md` | Current 1.30/9.88 persisted state |
| `.tmp/mathematical-reconciliation-implementation/REPORT.md` | Math guardrail implementation |
| `.tmp/gorgonzola-hardening-implementation/REPORT.md` | OCR meta session-only limitation |
| `.tmp/procurement-vs-operational-cost-audit/REPORT.md` | Independence / no persist validation |
| `src/lib/invoice-extraction-review.ts` | Review reason codes |
| `src/routes/invoices.tsx` | `needsExtractionConfirmation` integration |
