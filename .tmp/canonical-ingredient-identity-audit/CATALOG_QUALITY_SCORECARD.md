# Catalog Quality Scorecard

**Audit date:** 2026-06-15  
**Method:** Live execution of `buildCanonicalIngredientCreateDefaults` against Validation Lab extract data  
**Raw data:** `.tmp/canonical-ingredient-identity-audit/scorecard-data.json`

---

## Classification rubric

| Class | Criteria |
|-------|----------|
| **EXCELLENT** | No brand/pack/quantity noise retained; ≥25% tokens stripped; ≤5 tokens |
| **ACCEPTABLE** | ≤1 noise token; meaningful cleanup; usable with ≤1 edit |
| **WEAK** | Multiple brand/pack/quantity/supplier tokens retained; major rewrite needed |
| **EMPTY** | `suggestedCanonicalName === null` OR normalized suggestion ≡ invoice alias |

**Usable (EX + ACC):** Suggestions acceptable for one-click or minimal edit.

---

## Primary scope: Review & Create unmatched lines (33 rows)

Source: `.tmp/identity-expansion-simulation/matching-expansion-risk.json`

| Class | Count | % |
|-------|-------|---|
| EXCELLENT | 2 | 6.1% |
| ACCEPTABLE | 7 | 21.2% |
| WEAK | 10 | 30.3% |
| EMPTY | 14 | 42.4% |
| **Usable (EX + ACC)** | **9** | **27.3%** |

### By invoice supplier

| Supplier | Rows | EX+ACC | WEAK | EMPTY |
|----------|------|--------|------|-------|
| **Bidfood** | 10 | 0 (0%) | 2 (20%) | 8 (80%) |
| Emporio (live) | 8 | 1 (12.5%) | 4 (50%) | 3 (37.5%) |
| Mammafiore | 8 | 3 (37.5%) | 4 (50%) | 1 (12.5%) |
| Bocconcino | 6 | 4 (66.7%) | 0 (0%) | 2 (33.3%) |
| Aviludo April | 1 | 0 (0%) | 1 (100%) | 0 (0%) |

**Bidfood produce/herbs are the worst segment:** 0% usable suggestions, 80% empty.

---

## Secondary scope: All VL v30 unique extract names (51 rows)

Source: `.tmp/final-validation-lab-rerun-v30/extracts/*.json`

| Class | Count | % |
|-------|-------|---|
| EXCELLENT | 4 | 7.8% |
| ACCEPTABLE | 16 | 31.4% |
| WEAK | 11 | 21.6% |
| EMPTY | 20 | 39.2% |
| **Usable (EX + ACC)** | **20** | **39.2%** |

---

## Notable rows (Review & Create scope)

### EXCELLENT
- `RICOTTA TREVIGIANA 1,5KG` → `Ricotta trevigiana`
- `POMODORI PELATI (CX 2,5KG*6)` → `Pomodori pelati ( , *6)` *(cleanup artifact but noise-free)*

### ACCEPTABLE
- `Rovagnati - Salame Ventricina 2,5 Kg` → `Rovagnati - salame ventricina`
- `Farine Speciale pizza 25kg Amoruso` → `Farine speciale pizza amoruso`
- `STRACCIATELLA 250 GR` → `Stracciatella 250gr`

### WEAK (reported examples)
- `Manteiga Coimbra s/Sal Emb 1 Kg` → `Manteiga coimbra s/sal emb`
- `Ovo MORENO Classe M Cx.15 dúzias (CARTÃO)` → `Ovo moreno classe M dúzias cartão`

### EMPTY (reported examples)
- `Tomilho`, `Manjericão`, `Hortelã`, `Alho Francês`, `Abóbora Butternut`, `Courgettes`, `Pêra Abacate Hasse`
- `Salada Ibérica FSTK EMB. 250g` *(intermediate suggestion nulled by alias guard)*

---

## Quality distribution (visual)

```
Review & Create unmatched (n=33)
EXCELLENT  ██                           6%
ACCEPTABLE ███████                     21%
WEAK       ██████████                  30%
EMPTY      ██████████████              42%
```

---

## Methodology notes

- Scoring uses deterministic function output, not UI observation.
- Classification is heuristic based on retained brand/pack/quantity tokens; human review may differ on borderline ACCEPTABLE/WEAK rows.
- EMPTY includes both true nulls and alias-guard suppressions where cleanup ≡ invoice.
- Does not score matched rows (already resolved) or non-ingredient lines filtered by `isEligibleInvoiceIngredientRow`.
