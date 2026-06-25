# Operational Identity Canonicalization Audit

**VL:** `bjhnlrgodcqoyzddbpbd` · **Mode:** STRICT DESIGN-ONLY

## Recommendation: **Model D — Layered Identity Architecture**

| Layer | Role |
|-------|------|
| **A — Raw invoice text** | Evidence only (audit, re-read comparison) |
| **B — Canonical operational string** | Identity spine (product + form + SKU weight; commodity brand stripped) |
| **C — Supplier-scoped aliases** | Recall mechanism (equivalence classes) |

**Confidence: 87%**

---

## Why not A/B/C alone?

- **A (raw):** Proven fragile — Prosciutto re-read prefix drift
- **B (canonical):** Correct identity but needs alias recall layer
- **C (multi-alias):** Without B spine, normalization drift persists
- **D:** Formalizes what Marginly already approximates; fixes display/alias split

---

## Operational identity definition

> What the kitchen buys — not how the supplier printed the line.

**Strip:** commodity brand prefixes, bulk pack weights, marketing noise  
**Preserve:** form/cut, gram SKU weights, beverage brand names  
**Orthogonal:** purchase unit / economic identity (separate layer)

---

## Migration (measure only)

1. **Phase 1:** Brand-prefix strip on shared read+write alias spine (beverages exempt)
2. **Phase 2:** Measure optional `normalized_alias` backfill; collision audit
3. **Never:** Rewrite raw `invoice_items.name` or `alias_name`

---

## Investigation chain conclusion

[Possible match regression](2a540841-f4c4-425f-b75d-ed064ea17896) → [brand prefix coverage](c696d58f-3a69-4bf2-887b-bf1aff69c11d) → [write-path consistency](596e22ae-aca3-4bd6-903b-9d8225e95f25) → **this design gate**: align alias spine with display canonicalization under Model D before implementing.
