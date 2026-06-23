# Family A — Fix Design Review (Architecture & Validation Only)

Generated: 2026-06-20  
VL project: `bjhnlrgodcqoyzddbpbd`  
Constraint: NO implementation, NO code changes, NO DB writes — objective assessment only.

Evidence base: `family-a-fix-design/DESIGN.md`, `family-a-correction-validation-plan/PLAN.md`, `family-a-readiness-review/REPORT.md`, `family-a-scope-audit/`, `effective-paid-contract-validation-result.json`, `gorgonzola-root-cause/REPORT.md`, `invoice-table-extraction.ts`, `invoice-monetary-binding.ts`, `invoice-line-reconcile.ts`, `stock-normalization.ts`.

---

### Correction Locations

#### A) Hybrid H prompt (`TABLE_EXTRACTION_SYSTEM_PROMPT` in `invoice-table-extraction.ts`)

| Dimension | Assessment |
|-----------|------------|
| **What changes** | Add or refine Pass C vision instructions for Bocconcino-style rows: undiscounted lines with blank DESC, pack notation in description (`*6`, `1,5KG`), column-faithful QUANT reading. Existing POMODORI guardrail covers discounted CX+*N rows only — Mezzi/Ricotta fall outside it. |
| **Advantages** | Addresses first divergence stage (Pass C baseline qty=1 vs Hybrid H qty=2); good-path GPT raw cache already emits qty=1 for Mezzi/Ricotta; no new pipeline stage; Pomodori precedent shows prompt guardrails can work for adjacent Bocconcino rows. |
| **Risks** | Non-deterministic; Mezzi fails despite existing pack-notation rules; broad pack rules caused prior regressions (Aceto/Rulo `1→2` counterfactuals); cannot diff bad-path raw GPT (artifact gap in `family-a-v25-raw-capture/artifact-index.json`). |
| **Blast radius** | **All invoices** through Pass C table extraction (~every upload). Narrow Bocconcino undiscounted scope → localized; broad pack rules → global. |
| **Validation requirements** | Raw GPT capture for bad Hybrid H path (readiness blocker); 10× Bocconcino stability; 12-row + 15-candidate regression; Pomodori + Rolo unchanged; Mammafiore `*2` controls; prompt path must precede downstream replay per validation plan. |

#### B) Hybrid H structured output validation (new stage — does not exist today)

| Dimension | Assessment |
|-----------|------------|
| **What changes** | Intercept structured GPT JSON (`quantity`, `gross_unit_price`, `discount_pct`, `line_total_net`) immediately after Pass C, before `bindMonetaryColumns`. Reject, flag, or override rows where quantity appears sourced from description pack multiplier rather than QUANT column. |
| **Advantages** | Catches inflation before monetary binding halves unit_price; deterministic gate on structured fields; could scope triggers to supplier/template without re-invoking GPT; prevents `applyEffectivePaidPrice` from encoding wrong qty into effective_paid. |
| **Risks** | No such stage exists — new architecture; reliable heuristics require signals that individually fail to separate failures from controls (pack notation, blank CX, weight token each match ≥1 correct row); false rejects on legitimate multi-qty or fractional rows (Acqua qty=2, Gorgonzola qty=1.35); without column OCR fallback, same ambiguity as GPT. |
| **Blast radius** | **All table-pass outputs** on every invoke. Scoped to Bocconcino template → 1 supplier; global heuristics → all Pass C rows. |
| **Validation requirements** | Raw GPT JSON for Mezzi/Ricotta bad path; rule separation proof vs Rolo/Gorgonzola/Rulo Di Capra; 15-candidate replay on structured JSON inputs; stability if overrides interact with GPT variance. |

#### C) Post-extraction quantity validation (new dedicated gate, distinct from monetary binding)

| Dimension | Assessment |
|-----------|------------|
| **What changes** | New pipeline stage after Pass C / before or after binding: detect qty-inflation signature (extracted qty>1, total preserved, `unit_price ≈ total at qty=1`, undiscounted, pack notation) and correct quantity. Placement could be pre-binding (before `applyEffectivePaidPrice` halves unit) or post-binding with qty revert + unit re-derive. |
| **Advantages** | Deterministic; replayable on frozen v25 extracts without GPT calls; minimum separating combination documented (OCR qty=1 AND Hybrid H qty=2 stable AND undiscounted blank DESC AND unit≈total AND IL BOCCONCINO); fixes qty before downstream stock normalization for Ricotta (`purchaseContainerCount` 2→1). |
| **Risks** | Treats symptom not GPT cause; Gorgonzola shares qty=2 + total-preserved + `binding_changed` pattern (`diff_pct≈34%` vs failures `≈50%`); `effective-paid-contract-validation` marks Gorgonzola `would_fix: true` alongside Mezzi/Ricotta — empirical separation unproven; Rolo transient qty=2 (1/10) on same invoice shares undiscounted + weight token; single-condition rules fail. |
| **Blast radius** | Depends on placement and scope. Global rule → **all line items** through extraction finalize. Bocconcino supplier template scope → **1 supplier**. |
| **Validation requirements** | Offline replay on 15 candidates + Gorgonzola + Rolo negatives (critical blocker — not yet executed); assert 13/13 controls unchanged; diff_pct threshold calibration; Ricotta downstream stock replay (`normalizedUsableQuantity` 3000g→1500g). |

#### D) Monetary binding layer (`bindMonetaryColumns`, `applyEffectivePaidPrice` in `invoice-monetary-binding.ts`)

| Dimension | Assessment |
|-----------|------------|
| **What changes** | Extend existing binding: when `hasInconsistentGrossLineTotal` triggers `applyEffectivePaidPrice`, also revert `quantity` to `total / gross_unit_price` (or 1 when closure matches OCR-proxy signature) instead of only halving `unit_price`. Rule B/E neighbour bleed and discount rebind paths unchanged. |
| **Advantages** | Binding layer already handles Family A symptom (`applyEffectivePaidPrice` halves unit when qty×unit≠total); additive change in proven code path; `quantity` field currently **never modified** downstream — any qty fix here is provably the first mutation point; replay harness path documented in validation plan step 2. |
| **Risks** | Conflates price correction with qty correction — same trigger (`hasInconsistentGrossLineTotal`) fires on Gorgonzola (qty=2, total=13.44, diff_pct 34%); 12/15 flagged rows in effective-paid audit `would_fix` — broad binding change risks unrelated rows; discounted lines (Mozzarella qty=10) excluded by `discount_pct != null` guard on effective-paid but other binding paths may interact; symptom correction at same layer that encodes halving. |
| **Blast radius** | **All invoices** through monetary binding pipeline. Every row where qty×gross_unit_price exceeds total beyond tolerance. |
| **Validation requirements** | Replay `bindMonetaryColumns` → `finalizeExtractedLineItems` on frozen extracts; Gorgonzola 10-run negative; Emporio Pellegrino qty-decimal rows; assert `binding_changed` flag behavior on controls (Aceto must stay unchanged); Mezzi `structure_total` path unaffected, Ricotta usable stock changes. |

#### E) Invoice review workflow only (`src/routes/invoices.tsx`)

| Dimension | Assessment |
|-----------|------------|
| **What changes** | Surface qty mismatch for human correction before procurement/price-history write. User edits persisted `invoice_items.quantity`. No automatic qty flagging exists today. |
| **Advantages** | Zero extraction regression risk; immediate operational mitigation; no GPT variance; no blast radius on extraction pipeline. |
| **Risks** | Does not fix automation; DB already holds qty=2 for Mezzi/Ricotta (`phase1-validation-forensics`); stale qty persists until manual review; `resolveCountablePurchaseQuantityForCost` masks cost display (`purchase_quantity=1` at qty=2) — users may not notice; price history polluted (`history.new_price` halved). |
| **Blast radius** | **Per-invoice operational** — no extraction blast radius. Pricing/margin wrong until corrected; re-ingest plan deferred. |
| **Validation requirements** | UX review flow only; no regression test automation for extraction; manual pass/fail on flag accuracy for Mezzi/Ricotta class. |

#### F) Other

| Dimension | Assessment |
|-----------|------------|
| **What changes** | **Procurement layer** (`resolveCountablePurchaseQuantityForCost`): already returns `purchase_quantity=1` for Mezzi/Ricotta despite `quantity=2` — masks cost display. **Net-subtotal reconcile** (`reconcileLineItemsToNetSubtotal`): price-only gap fix, no qty. **Catalog/GT overrides**: manual GT correction. **Re-ingest/DB correction**: heal persisted rows post-fix. |
| **Advantages** | Procurement masking provides partial operational relief without touching extraction; GT overrides preserve audit integrity for known rows; re-ingest heals historical pollution after extraction fix. |
| **Risks** | Procurement masking hides symptom — `operational.current_price` and `history.new_price` remain wrong; does not prevent future uploads from reintroducing qty=2; GT overrides not scalable; re-ingest is operational burden separate from extraction fix. |
| **Blast radius** | Procurement: rows where `total≈qty×unit_price` at wrong qty. GT overrides: audit integrity only. Re-ingest: affected invoice_items + ingredient links. |
| **Validation requirements** | Procurement projection replay (`effective-paid-contract`); stock normalization replay; price history diff; no extraction regression suite needed for procurement-only path. |

**Pipeline fact:** `extractTableItemsFromImage` → `bindMonetaryColumns` → `reconcileLineItemAmounts` → `finalizeExtractedLineItems`. Quantity set at Pass C; binding preserves `quantity` and only adjusts `unit_price` via `applyEffectivePaidPrice`.

---

### Root Cause Alignment

| Location | Classification | Evidence |
|----------|----------------|----------|
| **A) Hybrid H prompt** | **Root-cause correction** | Failure originates at Pass C / Hybrid H (passc baseline qty=1 vs Hybrid H qty=2; downstream qty invariant proven). Prompt is the first stage where pack metadata is misread as purchased quantity. |
| **B) Hybrid H structured output validation** | **Mixed** | Intercepts at GPT output (root stage) but correction relies on post-hoc heuristics (symptom signatures) rather than re-reading QUANT column. Override without column OCR is inference, not root fix. |
| **C) Post-extraction quantity validation** | **Symptom correction** | Corrects qty after wrong extraction; does not prevent GPT from emitting qty=2 on future invokes unless coupled with prompt fix. Deterministic signature matching is downstream of failure origin. |
| **D) Monetary binding layer** | **Symptom correction (mixed if pre-effective-paid)** | `applyEffectivePaidPrice` already compensates for wrong qty by halving unit — extending to qty revert treats binding artifact, not GPT misread. If placed to run before effective-paid halving, partially prevents secondary symptom encoding. |
| **E) Invoice review workflow** | **Symptom correction / operational mitigation** | Human corrects persisted wrong qty; extraction continues to produce qty=2 on re-upload. No learning applied to pipeline. |
| **F) Other (procurement masking)** | **Symptom masking** | `purchase_quantity=1` despite `quantity=2` — hides display symptom; stored qty and price history remain wrong. Not a correction of extraction or binding. |
| **F) Other (re-ingest)** | **Symptom correction (downstream)** | Heals persisted state after upstream fix chosen; does not address extraction cause. |

**Failure mechanism (proven):** qty 1→2 at Hybrid H, total preserved, unit halved (~50% implied discount via `applyEffectivePaidPrice`). Root cause class: GPT Pass C pack-metadata → quantity conflation on Bocconcino undiscounted blank-DESC rows.

---

### Blast Radius Matrix

Impact if correction fires on its trigger signals. **LOW** = unlikely to alter correct row; **MEDIUM** = plausible false positive or GPT variance interaction; **HIGH** = likely incorrect change or direct target.

| Entity | A) Prompt | B) Structured validation | C) Post-extraction qty | D) Monetary binding | E) Review only | F) Other |
|--------|-----------|-------------------------|------------------------|--------------------|--------------------|----------|
| **Ricotta** (failure) | **HIGH** fix intent | **HIGH** fix intent | **HIGH** fix intent | **HIGH** fix intent | **HIGH** fix intent (manual) | LOW (masking only) |
| **Mezzi** (failure) | **HIGH** fix intent | **HIGH** fix intent | **HIGH** fix intent | **HIGH** fix intent | **HIGH** fix intent (manual) | LOW (masking only) |
| **Pomodori** (control) | **LOW** — POMODORI guardrail + DESC 20% populated; combo excludes | **LOW** — has `discount_pct` | **LOW** — blank-DESC + undiscounted combo excludes discounted row | **LOW** — discount path; qty=1 stable | **NONE** | **NONE** |
| **Rolo** (control / hardest negative) | **LOW–MEDIUM** — stably qty=1; 1/10 transient qty=2; same invoice undiscounted | **MEDIUM** — undiscounted blank CX matches failure profile on bad runs | **MEDIUM–HIGH** — shares undiscounted + unit≈total; transient qty=2 could trigger | **MEDIUM** — same `hasInconsistentGrossLineTotal` signature on run 7 | **NONE** | **NONE** |
| **Gorgonzola** (negative control) | **LOW** — different supplier/layout; Emporio GPT variance class | **MEDIUM** — qty=2 intermittent; discounted row | **MEDIUM–HIGH** — qty=2 + total-preserved + binding_changed; `diff_pct≈34%` vs 50%; `would_fix: true` in replay audit | **MEDIUM–HIGH** — same effective-paid trigger; 6/10 runs qty=2 | **NONE** | **NONE** |
| **Acqua** (control) | **LOW** — qty=2 column-faithful; not inflation pattern | **LOW** — OCR qty=2, not 1→2 inflation | **LOW** — not qty=1→2 signature | **LOW** — arithmetic consistent at qty=2 | **NONE** | **NONE** |
| **Mammafiore controls** (Aceto, Rulo, Farina) | **MEDIUM** — prior Aceto/Rulo `1→2` counterfactuals from broad pack rules | **MEDIUM** — `*2` pack notation ambiguity | **LOW–MEDIUM** — qty=1 stable; different supplier | **LOW** — no matching rows in 15-candidate set | **NONE** | **NONE** |
| **Aviludo controls** (Arroz, Açúcar, Pepinos, Mozzarella 2Kg) | **LOW** — 6/6 candidate rows correct; `N×SIZE` at qty=1 | **LOW** — no matching inflation pattern | **LOW** — tested stable at qty=1 | **LOW** — no Family A failures | **NONE** | **NONE** |
| **Bidfood controls** (Ovo Cx.15) | **LOW** — no Family A failures in corpus | **LOW** — no matching rows | **LOW** — different layout | **LOW** — different layout | **NONE** | **NONE** |

**Cross-supplier summary:** Bocconcino-scoped corrections (A narrow, C scoped) minimize Aviludo/Bidfood/Mammafiore risk. Global heuristics (B, C global, D) elevate Gorgonzola and Rolo to primary false-positive surfaces. E and F(procurement) have **NONE** extraction blast radius.

---

### Validation Burden

| Location | Burden | Replay | Stability | Regression |
|----------|--------|--------|-----------|------------|
| **A) Hybrid H prompt** | **HIGH** | Pass C baseline comparison; **raw GPT bad-path capture required first** (readiness blocker) | **Mandatory** 10× Bocconcino (`Mezzi/Ricotta ≥9/10 qty=1`; controls stable) | 12 official + 15 extended; Pomodori/Rolo/Mammafiore `*2`; prior Aceto/Rulo counterfactuals |
| **B) Hybrid H structured validation** | **HIGH** | Structured JSON replay on 15 candidates; separation proof vs Gorgonzola/Rolo | Medium — override logic must not fight GPT variance on re-invoke | Same 12+15 suite; false-reject rate on Acqua qty=2, fractional rows |
| **C) Post-extraction qty validation** | **MEDIUM–HIGH** | **Offline replay on frozen v25 extracts** (ready; **not yet executed** — blocker); no GPT variance for rule proof | Lower if deterministic; still need 10× if coupled with prompt | Gorgonzola 10-run + Rolo run-7 negative; Ricotta stock normalization diff; global gate 13/13 unchanged |
| **D) Monetary binding layer** | **MEDIUM–HIGH** | Same offline binding replay path as C; `effective-paid-contract` shows 12/15 `would_fix` — must prove selectivity | Low for deterministic binding; stability only if prompt still emits qty=2 (symptom recurs without qty revert) | Gorgonzola critical negative; Mozzarella discounted qty=10; Aceto `binding_changed=false` preserved |
| **E) Invoice review workflow** | **LOW** | None for extraction | None | UX acceptance only |
| **F) Other** | **LOW–MEDIUM** | Procurement/operational/history projection replay (`phase1-validation-forensics`, `effective-paid-contract`) | N/A for extraction | Re-ingest scope definition deferred |

**Readiness verdict C incorporation:** Validation burden for A, C, D remains **elevated to HIGH effective** until:
1. Pass C raw structured JSON captured for Mezzi/Ricotta bad Hybrid H path (`artifact-index.json` gap).
2. Offline replay executed on 15 candidates + Gorgonzola + Rolo negatives with documented pass/fail.

Without (1), A vs C/D origin attribution (GPT emits qty=2 vs binding inflates) cannot close — blocks final architecture selection. Without (2), Gorgonzola/Rolo separation remains theoretical (`would_fix: true` for both Family A failures and Gorgonzola).

---

### Architectural Assessment

Pipeline: **Invoice extraction → Procurement projection → Operational cost → Recipe/margin**

| Location | Layer | Correctness preservation | Downstream propagation |
|----------|-------|-------------------------|------------------------|
| **A) Prompt** | Invoice (extraction origin) | **Highest** — correct qty before any derived field; `unit_price`, `effective_paid`, stock normalization all inherit correct purchase count | Clean propagation: Ricotta `purchaseContainerCount` 1, Mezzi price €27.36, history €27.36 |
| **B) Structured validation** | Invoice (extraction gate) | **High** — qty corrected before binding if override fires; prevents effective-paid halving | Same as A if override is reliable; false override breaks procurement |
| **C) Post-extraction qty** | Invoice (post-GPT, pre/post-binding) | **Medium–High** — corrects qty before persistence; pre-binding placement avoids halved unit encoding; post-binding requires unit re-derive | Ricotta usable stock corrected (1500g); Mezzi structure_total path unaffected |
| **D) Monetary binding** | Invoice (binding sub-layer) | **Medium** — qty corrected alongside price semantics already in binding; conflates monetary and quantity domains | Prevents halved unit if qty reverted before `applyEffectivePaidPrice`; binding already last deterministic mutation before reconcile |
| **E) Review workflow** | Invoice (human gate, pre-procurement write) | **Low for automation** — correct qty only if human intervenes; extraction architecture unchanged | Manual correction propagates on save; no guarantee on future uploads |
| **F) Procurement masking** | Procurement | **Low** — architectural incorrectness preserved in `invoice_items.quantity`; display layer diverges from stored truth | Recipe/margin may use wrong `current_price` (€13.65 vs €27.36 for Mezzi) |
| **F) Re-ingest** | Cross-layer heal | **Medium** — restores downstream after upstream fix; not a substitute for extraction correctness | Required for persisted f0aa5a08 rows already at qty=2 |

**Quantity as architectural invariant:** `stock-normalization.ts` scales `purchaseContainerCount` from row quantity (Ricotta: generic `un` row × per-item weight). Wrong qty at extraction poisons operational cost and usable stock labels even when procurement masks purchase count. Earliest reliable correction point (A or pre-binding B/C) best preserves single-source-of-truth for purchase quantity through procurement → operational → recipe.

**Binding layer role:** `applyEffectivePaidPrice` explicitly preserves `quantity` and adjusts only `unit_price` — architectural signal that binding treats qty as authoritative from GPT. Adding qty mutation to D inverts that contract; C as separate stage preserves separation of concerns.

---

### Decision Framework

| Option | Root Cause Alignment | Blast Radius | Validation Burden | Architectural Fit |
|--------|---------------------|--------------|-------------------|-------------------|
| **A) Hybrid H prompt** | Root-cause | Global extraction (all invoices); LOW if Bocconcino-narrow | HIGH (raw GPT capture + 10× stability + full regression) | Invoice origin — highest pipeline correctness |
| **B) Hybrid H structured output validation** | Mixed | All Pass C outputs; reducible to supplier scope | HIGH (heuristic separation + structured JSON replay + stability) | Invoice gate — high if reliable; heuristic risk |
| **C) Post-extraction quantity validation** | Symptom | Global or 1-supplier depending on scope; Gorgonzola/Rolo MEDIUM–HIGH | MEDIUM–HIGH (offline replay ready but unexecuted; Gorgonzola/Rolo blockers) | Invoice post-GPT — good if pre-binding; does not fix GPT |
| **D) Monetary binding layer** | Symptom (mixed if pre-effective-paid) | All binding-path rows; 12/15 flagged in effective-paid audit | MEDIUM–HIGH (binding replay; Gorgonzola selectivity critical) | Invoice binding — conflates price/qty domains |
| **E) Invoice review workflow only** | Symptom / mitigation | NONE on extraction | LOW | Human gate — correct if edited; no automation |
| **F) Other (procurement / re-ingest)** | Symptom masking / downstream heal | Procurement display; persisted rows on re-ingest | LOW–MEDIUM (downstream replay only) | Wrong layer for extraction; re-ingest follows upstream fix |

---

### Confidence

| Claim | Level | Basis |
|-------|-------|-------|
| Family A localized to Mezzi + Ricotta on Bocconcino | **HIGH (92%)** | 51 rows audited, 13/15 candidates correct, 10/10 failure stability |
| Root cause at Hybrid H / Pass C, not downstream | **HIGH (88%)** | passc qty=1; binding preserves quantity; vl-final-state-audit |
| No single signal separates failures from all controls | **HIGH (90%)** | scope-audit separating combination requires 5 conjunctive conditions |
| Gorgonzola is distinct failure class but structurally confusable at binding | **HIGH (85%)** | diff_pct 34% vs 50%; Emporio GPT variance vs Bocconcino stable 10/10 |
| Post-extraction replay can validate C/D offline | **HIGH (85%)** | Frozen v25 extracts exist; binding path documented |
| Post-extraction rule safely separates Gorgonzola/Rolo | **LOW (35%)** | Replay not executed; Gorgonzola `would_fix: true`; Rolo transient unproven |
| Prompt-only sufficiency for undiscounted blank-DESC rows | **LOW (40%)** | POMODORI guardrail insufficient; Mezzi outside guardrail class |
| Raw GPT bad-path origin (GPT vs binding) | **UNRESOLVED** | Critical blocker per readiness verdict C |
| Safest correction point objectively determinable today | **NOT RESOLVABLE** | Blocked by missing raw GPT capture + unexecuted replay |
| Overall design-review confidence | **MEDIUM (78%)** | Strong scope/localization evidence; correction-point selection blocked by three critical unknowns |

**Assessment status:** Architecture options enumerated and evaluated. Implementation readiness remains **NOT READY** (readiness verdict C). One bounded final investigation (raw GPT capture + offline replay) required before correction architecture can be objectively ranked.
