# Review & Create Impact

**Audit date:** 2026-06-15

---

## Question

Should the user proceed with large-scale Review & Create now, or improve canonical generation first?

## Answer

**Improve canonicals first** — or limit Review & Create to invoice types with proven suggestion quality (Bocconcino-style shorthand).

---

## Current manual correction burden

Based on 33 unmatched Validation Lab lines (Review & Create scope):

| Burden type | Rows | % | Est. time/row |
|-------------|------|---|---------------|
| One-click accept (EX+ACC) | 9 | 27% | ~3 sec |
| Light edit (WEAK) | 10 | 30% | ~15–20 sec |
| Full name entry (EMPTY) | 14 | 42% | ~25–40 sec |

**Estimated total for 33 rows today:** ~12–18 minutes of manual naming work, assuming experienced operator.

**Bidfood invoice alone (10 rows):** ~8–12 minutes — 80% require full name entry, 0% one-click.

---

## Expected burden after recommended fix (Hybrid Option D)

| Burden type | Rows (est.) | % | Est. time/row |
|-------------|-------------|---|---------------|
| One-click accept | 18–20 | 55–60% | ~3 sec |
| Light edit | 8–10 | 25–30% | ~10 sec |
| Full name entry | 4–6 | 12–18% | ~25 sec |

**Estimated total for 33 rows after fix:** ~4–6 minutes.

**Bidfood after fix (est.):** ~3–4 minutes — produce/herbs pre-filled, branded lines cleaned.

---

## Risk of proceeding now

| Risk | Severity | Detail |
|------|----------|--------|
| Catalog pollution | **High** | Users may accept weak suggestions (`Manteiga coimbra s/sal emb`) under time pressure |
| Inconsistent naming | **High** | EMPTY rows force ad-hoc names → duplicate ingredients (Tomilho vs tomilho vs Tomilho fresco) |
| Operator fatigue | **Medium** | 42% empty rate on unmatched scope increases errors |
| Data correctness | **Low** | Matching/pricing/OCR validated — this is catalog quality only |

---

## Invoice-type guidance (if proceeding selectively)

| Invoice type | Usable rate | Proceed? |
|--------------|-------------|----------|
| Bocconcino (shorthand) | ~67% | **Yes** — operational path works |
| Mammafiore (mixed) | ~38% | **Cautious** — review each suggestion |
| Emporio (branded Italian) | ~13% | **No** — mostly WEAK/EMPTY |
| Bidfood (produce/herbs) | **0%** | **No** — manual naming required anyway |

---

## Recommendation

1. **Do not** bulk Review & Create on Bidfood or Emporio until canonical improvement Phase 1–2 complete.
2. **May proceed** on Bocconcino/Aviludo shorthand lines with manual review of each suggestion.
3. Re-run this scorecard after each improvement phase before expanding scope.

---

## Burden comparison summary

| Scenario | Manual naming burden | Catalog pollution risk |
|----------|---------------------|------------------------|
| **Proceed now (all 33 rows)** | ~12–18 min | High |
| **Proceed now (Bidfood only)** | ~8–12 min | High |
| **After hybrid fix** | ~4–6 min | Low–medium |
| **Improve first, then proceed** | ~4–6 min | Low–medium |

**Net savings after fix:** ~60–70% reduction in manual naming time for same row count.
