# New Contamination Search

**No new history INSERTs after Phase 4C repair.**

**Repair regression detected:**

| Event | Evidence |
|-------|----------|
| Phase 4C fixed Atum Apr | `new: 6.29` in clean.json |
| Live today | `new: 3.145`, May Δ% **+316.5%** |
| Catalog regression | Atum `purchase_quantity: 2` at 2026-06-16T17:13 |

**7/13 sample rows contaminated** in re-audit. Full VL unchanged at **10/27 (37%)**.

Multi-`un` lines will **re-contaminate** on next extract/confirm/re-sync until `total` is wired through persist callers.
