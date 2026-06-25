# Foundation Certification Audit

**Validation Lab:** `bjhnlrgodcqoyzddbpbd` · **Read-only** · 2026-06-25T13:50:05Z

## Certification Decision

### 🟡 FOUNDATION CONDITIONALLY CERTIFIED

The **Procurement → Operational → Historical Pricing** math pipeline is **internally consistent** for the majority of VL ingredients (37/40 pass procurement + operational normalization). All 51 invoice lines have persisted matches. Economics on re-extracted rows (Gorgonzola, Guanciale) align with PDF ground truth.

**Blockers for full 🟢 closure:**

1. **Match read-path split** — 26/40 confirmed matches show `virtual≠confirmed` because `VITE_MATCH_LIFECYCLE_READ_CUTOVER` is off in audit env; validation/matching surfaces diverge from `invoice_item_matches`.
2. **Multi-invoice history drift** — 12 ingredients have history rows whose `new_price` operational values or delta math diverge from latest catalog (Aviludo April→May chains).
3. **Catalog pack semantics** — 7 failed ingredients (Aceto, Ovo, Tomilho, Ginger Beer, Peroni, Água Pellegrino, Prosciutto) have `purchase_quantity` denominator mismatches vs latest line normalization.
4. **Discount binding** — Aceto/Ginger Beer/Peroni discount rows: persisted totals correct but catalog/history not refreshed to latest economics.

## Executive Summary

| Metric | Value |
|--------|-------|
| Ingredients audited | **40** |
| 🟢 Certified | **4** |
| 🟡 Conditional | **29** |
| 🔴 Failed | **7** |
| Unmatched invoice lines | 0 |
| Production-grade | **Partial** |
| Confidence | **60%** |

**Biggest architectural weakness:** Match lifecycle read path — persisted invoice_item_matches not consumed when VITE_MATCH_LIFECYCLE_READ_CUTOVER is off

## Risk Assessment

| Priority | Count |
|----------|-------|
| P0 | 0 |
| P1 | 17 |
| P2 | 1 |
| P3 | 5 |
| P4 | 0 |

## Certification Table

| Ingredient | Status | GT | Proc | Op | Catalog | History | Match | Valid | UI | Arch |
|------------|--------|----|------|----|---------|---------|-------|-------|----|------|
| Abóbora butternut | 🟡 | PARTIAL | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Aceto balsamico di modena IGP | 🔴 | PARTIAL | PASS | PASS | FAIL | FAIL | PARTIAL | PASS | FAIL | FAIL |
| Açúcar branco | 🟡 | PASS | PASS | PASS | PASS | FAIL | PARTIAL | PASS | PASS | PARTIAL |
| Água san pellegrino | 🔴 | PARTIAL | PASS | PASS | FAIL | FAIL | PARTIAL | PASS | FAIL | FAIL |
| Alho francês | 🟡 | PARTIAL | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Anchoas | 🟡 | N/A | PASS | PASS | PASS | PASS | PARTIAL | PASS | PASS | PARTIAL |
| Arroz agulha | 🟡 | PASS | PASS | PASS | PASS | FAIL | PARTIAL | PASS | PASS | PARTIAL |
| Atum em óleo | 🟡 | FAIL | PASS | PASS | PASS | PASS | PARTIAL | PASS | PASS | PARTIAL |
| Chocolate culinária | 🟡 | PASS | PASS | PASS | PASS | FAIL | PARTIAL | PASS | PASS | PARTIAL |
| Courgettes | 🟡 | PARTIAL | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Farina do pasta fresca e gnocchi | 🟡 | PARTIAL | PASS | PASS | PASS | PASS | PARTIAL | PASS | PASS | PARTIAL |
| Farine speciale pizza | 🟡 | PARTIAL | PASS | PASS | PASS | PASS | PARTIAL | PASS | PASS | PARTIAL |
| Gema líquida | 🟡 | PASS | PASS | PASS | PASS | PASS | PARTIAL | PASS | PASS | PARTIAL |
| Ginger beer | 🔴 | PARTIAL | PASS | PASS | FAIL | FAIL | PARTIAL | PASS | PASS | FAIL |
| Gorgonzola DOP dolce | 🟡 | PASS | PASS | PASS | PASS | PASS | PARTIAL | PASS | PASS | PARTIAL |
| Guanciale stagionato | 🟡 | PARTIAL | PASS | PASS | PASS | PASS | PARTIAL | PASS | PASS | PARTIAL |
| Hortelã | 🟡 | PARTIAL | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Manjericão | 🟢 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Manteiga s/sal | 🟡 | PASS | PASS | PASS | PASS | PASS | PARTIAL | PASS | PASS | PARTIAL |
| Mezzi paccheri mancini | 🟡 | PARTIAL | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Mortadella IGP massima con pistacchio | 🟡 | PARTIAL | PASS | PASS | PASS | PASS | PARTIAL | PASS | PASS | PARTIAL |
| Mozzarella fior di latte | 🟡 | PARTIAL | PASS | PASS | PASS | FAIL | PARTIAL | PASS | PASS | PARTIAL |
| Mozzarella julienne | 🟡 | PARTIAL | PASS | PASS | PASS | PASS | PARTIAL | PASS | PASS | PARTIAL |
| Nata culinária | 🟡 | PASS | PASS | PASS | PASS | FAIL | PARTIAL | PASS | PASS | PARTIAL |
| Ovo classe M | 🔴 | PASS | PASS | PASS | FAIL | PASS | PARTIAL | PASS | FAIL | PARTIAL |
| Paccheri lisci | 🟡 | PARTIAL | PASS | PASS | PASS | PASS | PARTIAL | PASS | PASS | PARTIAL |
| Pepino conserva | 🟡 | PASS | PASS | PASS | PASS | FAIL | PARTIAL | PASS | PASS | PARTIAL |
| Pepino fresco | 🟡 | PARTIAL | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Pêra abacate | 🟡 | PARTIAL | PASS | PASS | PASS | PASS | PARTIAL | PASS | PASS | PARTIAL |
| Peroni nastro azzurro 33cl | 🔴 | PARTIAL | PASS | PASS | FAIL | FAIL | PARTIAL | PASS | PASS | FAIL |
| Pomodori pelati | 🟢 | N/A | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Prosciutto cotto scelto | 🔴 | PARTIAL | PASS | PASS | PASS | FAIL | PARTIAL | PARTIAL | PASS | PARTIAL |
| Ricotta trevigiana | 🟢 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Rigamonti bresaola punta d'anca oro | 🟡 | PARTIAL | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Rolo de cabra e vaca | 🟢 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Rovagnati salame ventricina | 🟡 | PARTIAL | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Rulo di capra | 🟡 | PARTIAL | PASS | PASS | PASS | PASS | PARTIAL | PASS | PASS | PARTIAL |
| Salada ibérica | 🟡 | PARTIAL | PASS | PASS | PASS | PASS | PARTIAL | PASS | PASS | PARTIAL |
| Stracciatella | 🟡 | PARTIAL | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Tomilho | 🔴 | PASS | PASS | PASS | FAIL | PASS | PASS | PASS | FAIL | PARTIAL |

## Grouped Findings

### architecture

- Anchoas: persisted confirmed; virtual=unmatched (alias/read-cutover gap); procurement→operational→catalog→history chain incomplete
- Gema líquida: persisted confirmed; virtual=unmatched (alias/read-cutover gap); procurement→operational→catalog→history chain incomplete
- Pepino conserva: history delta math invalid for row 5bd9a4e1-713f-4474-9985-f46bdb1b36b0; persisted confirmed; virtual=unmatched (alias/read-cutover gap); procurement→operational→catalog→history chain incomplete
- Atum em óleo: PDF/ground-truth mismatch on latest invoice line; persisted confirmed; virtual=suggested (alias/read-cutover gap); procurement→operational→catalog→history chain incomplete
- Arroz agulha: history delta math invalid for row edc6c627-d934-40de-8eb8-cc0a25d36755; persisted confirmed; virtual=unmatched (alias/read-cutover gap); procurement→operational→catalog→history chain incomplete
- Chocolate culinária: history delta math invalid for row bf250ee4-388a-480f-96d7-e8c0e8e8dfb2; persisted confirmed; virtual=suggested (alias/read-cutover gap); procurement→operational→catalog→history chain incomplete
- Açúcar branco: history delta math invalid for row 1d9d5133-724b-461c-b141-605392f2b64d; persisted confirmed; virtual=unmatched (alias/read-cutover gap); procurement→operational→catalog→history chain incomplete
- Nata culinária: history delta math invalid for row da9d4ea1-f7ee-427e-869b-623aacbd550d; persisted confirmed; virtual=suggested (alias/read-cutover gap); procurement→operational→catalog→history chain incomplete
- Mozzarella fior di latte: history delta math invalid for row f0f76e84-f4c5-4dc1-9fb6-ba026d2384d0; persisted confirmed; virtual=suggested (alias/read-cutover gap); procurement→operational→catalog→history chain incomplete
- Ovo classe M: catalog purchase_quantity 1 ≠ computed 180; persisted confirmed; virtual=unmatched (alias/read-cutover gap); line op 0.21355555555555555 ≠ catalog op 38.44; procurement→operational→catalog→history chain incomplete
- Pêra abacate: persisted confirmed; virtual=suggested (alias/read-cutover gap); procurement→operational→catalog→history chain incomplete
- Salada ibérica: persisted confirmed; virtual=suggested (alias/read-cutover gap); procurement→operational→catalog→history chain incomplete
- Tomilho: catalog purchase_quantity 1 ≠ computed 100; line op 0.0206 ≠ catalog op 2.06; procurement→operational→catalog→history chain incomplete
- Manteiga s/sal: persisted confirmed; virtual=suggested (alias/read-cutover gap); procurement→operational→catalog→history chain incomplete
- Mortadella IGP massima con pistacchio: persisted confirmed; virtual=suggested (alias/read-cutover gap); procurement→operational→catalog→history chain incomplete
- … and 12 more

### matching

- Anchoas: persisted confirmed; virtual=unmatched (alias/read-cutover gap); procurement→operational→catalog→history chain incomplete
- Gema líquida: persisted confirmed; virtual=unmatched (alias/read-cutover gap); procurement→operational→catalog→history chain incomplete
- Pepino conserva: history delta math invalid for row 5bd9a4e1-713f-4474-9985-f46bdb1b36b0; persisted confirmed; virtual=unmatched (alias/read-cutover gap); procurement→operational→catalog→history chain incomplete
- Atum em óleo: PDF/ground-truth mismatch on latest invoice line; persisted confirmed; virtual=suggested (alias/read-cutover gap); procurement→operational→catalog→history chain incomplete
- Arroz agulha: history delta math invalid for row edc6c627-d934-40de-8eb8-cc0a25d36755; persisted confirmed; virtual=unmatched (alias/read-cutover gap); procurement→operational→catalog→history chain incomplete
- Chocolate culinária: history delta math invalid for row bf250ee4-388a-480f-96d7-e8c0e8e8dfb2; persisted confirmed; virtual=suggested (alias/read-cutover gap); procurement→operational→catalog→history chain incomplete
- Açúcar branco: history delta math invalid for row 1d9d5133-724b-461c-b141-605392f2b64d; persisted confirmed; virtual=unmatched (alias/read-cutover gap); procurement→operational→catalog→history chain incomplete
- Nata culinária: history delta math invalid for row da9d4ea1-f7ee-427e-869b-623aacbd550d; persisted confirmed; virtual=suggested (alias/read-cutover gap); procurement→operational→catalog→history chain incomplete
- Mozzarella fior di latte: history delta math invalid for row f0f76e84-f4c5-4dc1-9fb6-ba026d2384d0; persisted confirmed; virtual=suggested (alias/read-cutover gap); procurement→operational→catalog→history chain incomplete
- Ovo classe M: catalog purchase_quantity 1 ≠ computed 180; persisted confirmed; virtual=unmatched (alias/read-cutover gap); line op 0.21355555555555555 ≠ catalog op 38.44; procurement→operational→catalog→history chain incomplete
- Pêra abacate: persisted confirmed; virtual=suggested (alias/read-cutover gap); procurement→operational→catalog→history chain incomplete
- Salada ibérica: persisted confirmed; virtual=suggested (alias/read-cutover gap); procurement→operational→catalog→history chain incomplete
- Manteiga s/sal: persisted confirmed; virtual=suggested (alias/read-cutover gap); procurement→operational→catalog→history chain incomplete
- Mortadella IGP massima con pistacchio: persisted confirmed; virtual=suggested (alias/read-cutover gap); procurement→operational→catalog→history chain incomplete
- Água san pellegrino: catalog purchase_quantity 15 ≠ computed 11250; latest history op 0.0017137777777777778 ≠ catalog op 1.2853333333333334; history delta math invalid for row 4a00605a-a9e7-4b93-969b-92e5aae8e714; persisted confirmed; virtual=unmatched (alias/read-cutover gap); line op 0.0017137777777777778 ≠ catalog op 1.2853333333333334; procurement→operational→catalog→history chain incomplete
- … and 11 more

### invoiceGroundTruth

- Atum em óleo: PDF/ground-truth mismatch on latest invoice line; persisted confirmed; virtual=suggested (alias/read-cutover gap); procurement→operational→catalog→history chain incomplete
- Mozzarella fior di latte: history delta math invalid for row f0f76e84-f4c5-4dc1-9fb6-ba026d2384d0; persisted confirmed; virtual=suggested (alias/read-cutover gap); procurement→operational→catalog→history chain incomplete
- Abóbora butternut: PARTIAL
- Alho francês: PARTIAL
- Courgettes: PARTIAL
- Pêra abacate: persisted confirmed; virtual=suggested (alias/read-cutover gap); procurement→operational→catalog→history chain incomplete
- Pepino fresco: PARTIAL
- Hortelã: PARTIAL
- Salada ibérica: persisted confirmed; virtual=suggested (alias/read-cutover gap); procurement→operational→catalog→history chain incomplete
- Mortadella IGP massima con pistacchio: persisted confirmed; virtual=suggested (alias/read-cutover gap); procurement→operational→catalog→history chain incomplete
- Água san pellegrino: catalog purchase_quantity 15 ≠ computed 11250; latest history op 0.0017137777777777778 ≠ catalog op 1.2853333333333334; history delta math invalid for row 4a00605a-a9e7-4b93-969b-92e5aae8e714; persisted confirmed; virtual=unmatched (alias/read-cutover gap); line op 0.0017137777777777778 ≠ catalog op 1.2853333333333334; procurement→operational→catalog→history chain incomplete
- Rigamonti bresaola punta d'anca oro: PARTIAL
- Ginger beer: catalog purchase_quantity 24 ≠ computed 200; latest history op 0.004050000000000001 ≠ catalog op 0.03375; persisted confirmed; virtual=suggested (alias/read-cutover gap); procurement→operational→catalog→history chain incomplete
- Rovagnati salame ventricina: PARTIAL
- Paccheri lisci: persisted confirmed; virtual=suggested (alias/read-cutover gap); procurement→operational→catalog→history chain incomplete
- … and 10 more

### priceHistory

- Pepino conserva: history delta math invalid for row 5bd9a4e1-713f-4474-9985-f46bdb1b36b0; persisted confirmed; virtual=unmatched (alias/read-cutover gap); procurement→operational→catalog→history chain incomplete
- Arroz agulha: history delta math invalid for row edc6c627-d934-40de-8eb8-cc0a25d36755; persisted confirmed; virtual=unmatched (alias/read-cutover gap); procurement→operational→catalog→history chain incomplete
- Chocolate culinária: history delta math invalid for row bf250ee4-388a-480f-96d7-e8c0e8e8dfb2; persisted confirmed; virtual=suggested (alias/read-cutover gap); procurement→operational→catalog→history chain incomplete
- Açúcar branco: history delta math invalid for row 1d9d5133-724b-461c-b141-605392f2b64d; persisted confirmed; virtual=unmatched (alias/read-cutover gap); procurement→operational→catalog→history chain incomplete
- Nata culinária: history delta math invalid for row da9d4ea1-f7ee-427e-869b-623aacbd550d; persisted confirmed; virtual=suggested (alias/read-cutover gap); procurement→operational→catalog→history chain incomplete
- Mozzarella fior di latte: history delta math invalid for row f0f76e84-f4c5-4dc1-9fb6-ba026d2384d0; persisted confirmed; virtual=suggested (alias/read-cutover gap); procurement→operational→catalog→history chain incomplete
- Água san pellegrino: catalog purchase_quantity 15 ≠ computed 11250; latest history op 0.0017137777777777778 ≠ catalog op 1.2853333333333334; history delta math invalid for row 4a00605a-a9e7-4b93-969b-92e5aae8e714; persisted confirmed; virtual=unmatched (alias/read-cutover gap); line op 0.0017137777777777778 ≠ catalog op 1.2853333333333334; procurement→operational→catalog→history chain incomplete
- Ginger beer: catalog purchase_quantity 24 ≠ computed 200; latest history op 0.004050000000000001 ≠ catalog op 0.03375; persisted confirmed; virtual=suggested (alias/read-cutover gap); procurement→operational→catalog→history chain incomplete
- Prosciutto cotto scelto: price_history row from unconfirmed suggested match; procurement→operational→catalog→history chain incomplete
- Peroni nastro azzurro 33cl: catalog purchase_quantity 24 ≠ computed 7920; latest history op 0.0001351010101010101 ≠ catalog op 0.044583333333333336; persisted confirmed; virtual=suggested (alias/read-cutover gap); procurement→operational→catalog→history chain incomplete
- Aceto balsamico di modena IGP: catalog purchase_quantity 2 ≠ computed 10000; latest history op 0.001609 ≠ catalog op 8.045; persisted confirmed; virtual=suggested (alias/read-cutover gap); line op 0.001609 ≠ catalog op 8.045; procurement→operational→catalog→history chain incomplete

### ingredientCatalog

- Ovo classe M: catalog purchase_quantity 1 ≠ computed 180; persisted confirmed; virtual=unmatched (alias/read-cutover gap); line op 0.21355555555555555 ≠ catalog op 38.44; procurement→operational→catalog→history chain incomplete
- Tomilho: catalog purchase_quantity 1 ≠ computed 100; line op 0.0206 ≠ catalog op 2.06; procurement→operational→catalog→history chain incomplete
- Água san pellegrino: catalog purchase_quantity 15 ≠ computed 11250; latest history op 0.0017137777777777778 ≠ catalog op 1.2853333333333334; history delta math invalid for row 4a00605a-a9e7-4b93-969b-92e5aae8e714; persisted confirmed; virtual=unmatched (alias/read-cutover gap); line op 0.0017137777777777778 ≠ catalog op 1.2853333333333334; procurement→operational→catalog→history chain incomplete
- Ginger beer: catalog purchase_quantity 24 ≠ computed 200; latest history op 0.004050000000000001 ≠ catalog op 0.03375; persisted confirmed; virtual=suggested (alias/read-cutover gap); procurement→operational→catalog→history chain incomplete
- Peroni nastro azzurro 33cl: catalog purchase_quantity 24 ≠ computed 7920; latest history op 0.0001351010101010101 ≠ catalog op 0.044583333333333336; persisted confirmed; virtual=suggested (alias/read-cutover gap); procurement→operational→catalog→history chain incomplete
- Aceto balsamico di modena IGP: catalog purchase_quantity 2 ≠ computed 10000; latest history op 0.001609 ≠ catalog op 8.045; persisted confirmed; virtual=suggested (alias/read-cutover gap); line op 0.001609 ≠ catalog op 8.045; procurement→operational→catalog→history chain incomplete

### uiConsistency

- Ovo classe M: catalog purchase_quantity 1 ≠ computed 180; persisted confirmed; virtual=unmatched (alias/read-cutover gap); line op 0.21355555555555555 ≠ catalog op 38.44; procurement→operational→catalog→history chain incomplete
- Tomilho: catalog purchase_quantity 1 ≠ computed 100; line op 0.0206 ≠ catalog op 2.06; procurement→operational→catalog→history chain incomplete
- Água san pellegrino: catalog purchase_quantity 15 ≠ computed 11250; latest history op 0.0017137777777777778 ≠ catalog op 1.2853333333333334; history delta math invalid for row 4a00605a-a9e7-4b93-969b-92e5aae8e714; persisted confirmed; virtual=unmatched (alias/read-cutover gap); line op 0.0017137777777777778 ≠ catalog op 1.2853333333333334; procurement→operational→catalog→history chain incomplete
- Aceto balsamico di modena IGP: catalog purchase_quantity 2 ≠ computed 10000; latest history op 0.001609 ≠ catalog op 8.045; persisted confirmed; virtual=suggested (alias/read-cutover gap); line op 0.001609 ≠ catalog op 8.045; procurement→operational→catalog→history chain incomplete

### validation

- Prosciutto cotto scelto: price_history row from unconfirmed suggested match; procurement→operational→catalog→history chain incomplete

## Known Reference Cases

| Case | Expected | Observed |
|------|----------|----------|
| gorgonzola | see prior audits | conditional — persisted confirmed; virtual=unmatched (alias/read-cutover gap); procurement→operational→catalog→history chain incomplete |
| guanciale | see prior audits | conditional — persisted confirmed; virtual=suggested (alias/read-cutover gap); procurement→operational→catalog→history chain incomplete |
| aceto | see prior audits | failed — catalog purchase_quantity 2 ≠ computed 10000; latest history op 0.001609 ≠ catalog op 8.045 |

## Architectural Observations

1. **Procurement→Operational math** is deterministic via `recipeOperationalCostFieldsFromInvoiceLine` / `operationalCostFieldsFromInvoiceLine` — certified ingredients show catalog sync when persist path ran.
2. **Match lifecycle read cutover** (`VITE_MATCH_LIFECYCLE_READ_CUTOVER`) splits persisted `invoice_item_matches` from virtual alias resolution — confirmed DB matches can still show `UNMATCHED_INGREDIENT` on default path.
3. **Price history** only trustworthy when match is confirmed; suggested-match history rows contaminate catalog (Nata-class).
4. **PDF ground truth** validation is partial — `field-accuracy-audit/ground-truth.json` covers ~6 invoices; discount rows (Aceto) need net unit_price not gross.
5. **Discount binding** without persisted `gross_unit_price`/`discount_pct` causes false `MATHEMATICAL_INCONSISTENCY` on otherwise-correct totals.

## Remaining Risks

- Pepino conserva: price history sync/orphan
- Arroz agulha: price history sync/orphan
- Chocolate culinária: price history sync/orphan
- Açúcar branco: price history sync/orphan
- Nata culinária: price history sync/orphan
- Mozzarella fior di latte: price history sync/orphan
- Ovo classe M: catalog ≠ latest invoice economics
- Tomilho: catalog ≠ latest invoice economics
- Água san pellegrino: catalog ≠ latest invoice economics
- Água san pellegrino: price history sync/orphan

## Recommendation

**Conditional foundation** — economics pipeline is sound for certified rows; enable match read cutover and complete VL re-read before production alerts.