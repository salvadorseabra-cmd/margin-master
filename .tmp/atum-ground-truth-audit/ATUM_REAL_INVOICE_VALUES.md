# Atum Real Invoice Values

**Source:** Physical Aviludo invoice scans (`.tmp/aviludo-investigation/`)

---

## April 17 — `c2f52357-0f80-491a-ba14-c97ff4837472`

**Product:** Atum Óleo Bolsa Nau Catrineta 1 Kg

| Date | Qty | Unit | Unit Price | Line Total |
|------|-----|------|------------|------------|
| 2026-04-17 | 2 | un | **€6.29** | **€12.58** |

**Per-bag truth: €6.29**

---

## May 19 — `3b4cb21f-8b3f-45f3-9f2d-6f438a2`

**Product:** Atum Óleo Bolsa Nau Catrineta 1 Kg

| Date | Qty | Unit | Unit Price | Line Total |
|------|-----|------|------------|------------|
| 2026-05-19 | 2 | un | **€6.55** | **€13.10** |

**Per-bag truth: €6.55** (not €13.10)

---

## Critical note

Prior audits used confirmed item `79956d1b` (qty=1, unit_price=€13.10) — that is the **line total collapsed into unit price**, not per-bag pricing. Original DB row `6da6be6a` (2×€6.55=€13.10) matches the physical invoice.
