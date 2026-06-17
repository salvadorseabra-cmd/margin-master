# Live Integrity Check

**History rows created after 2026-06-14:** **0**

| Check | Result |
|-------|--------|
| Post-repair INSERT integrity | **N/A** — no new rows |
| Post-repair UPDATE | **FAIL** — Atum Apr reverted 6.29 → 3.145 |
| Catalog sync 2026-06-16 | **FAIL** — Atum pq=2 at 17:13 |
| validate-historical-pricing.mts | 7 contaminated / 6 clean in sample |

**Cannot prove forward INSERT is clean** — zero post-repair history inserts.
