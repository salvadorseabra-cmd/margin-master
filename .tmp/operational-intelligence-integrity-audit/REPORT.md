# Operational Intelligence Integrity Audit

**Generated:** 2026-06-13  
**Mode:** READ-ONLY — Supabase replay of `/alerts` pipeline

---

## Final Answer

**Can Marginly safely expose Operational Intelligence to real restaurants today?**

**NOT YET — /alerts OI is partial; home dashboard is mock-only**

**Status:** **PARTIAL** (76% confidence)

Synthesis code math is sound, but outputs inherit identity-collapsed price_history and stale Jun 11 DB. Home dashboard (/) shows mock data only — not production intelligence.

---

## Critical Finding: Two Surfaces

| Route | Data source | Trust |
|-------|-------------|-------|
| `/` Home dashboard | `mock-data.ts` | **Mock only** — not production |
| `/alerts` Operational Intelligence | Supabase → synthesis | **Partial** — real data, poisoned inputs |

---

## Data Pipeline (verified)

```
invoice_items → (match) → ingredient_price_history
                        → ingredients.current_price
getRecentPriceChanges(180d) ─┐
recipes + recipe_ingredients ─┼→ MarginAlertData
invoices(180d) ───────────────┘
        ↓
buildOperationalAlertItems + buildMarginAlertsFromSupabase
        ↓
buildSynthesisViewModel → ownerReview (weekly snapshot, risks, opportunities, suppliers)
```

**Synthesis arithmetic:** trusted (delta %, exposure modeling consistent with prior pricing audit).  
**Synthesis inputs:** not trusted when identity collapses or DB is stale.

---

## 1. Trusted Outputs

- Recipe margin metrics (catalog current_price × recipe lines)
- Recipe below-target alerts (when selling_price set)
- Cost concentration / prep cascade (recipe graph)
- Atum em óleo +4.1% movement (single-format chain)
- Operational health panel structure (invoice freshness counts)

---

## 2. Untrusted Outputs

- Mozzarella +1341% price increase / financial risk
- Pepino −99.95% price decrease opportunity
- Supplier watchlist spike notes on mixed-format ingredients
- Home dashboard KPIs and charts (mock-data.ts)

---

## 3. Stale Outputs

- 14/20 price_history ghost rows feeding supplier counts
- 5/6 VL invoices DB rows from Jun 11–12 era
- Emporio live: 8 items, 0 price_history — no OI contribution
- Weekly snapshot supplier increase/decrease counts

---

## 4. Dashboard Bugs

- **Home `/` dashboard uses 100% mock data** — food cost, margin, revenue, charts, AI insight are not connected to Supabase
- **Header total ≠ line sum** on invoices is expected (IVA) — not a synthesis bug
- **Weekly snapshot** `supplierIncreases`/`decreases` count all price_history moves in 90d window including ghost rows

---

## 5. Opportunity Bugs

| Bug | Impact | Class |
|-----|--------|-------|
| Mozzarella +1341% | False critical price increase, financial risk row | identity_collapse |
| Pepino −99.95% | False price decrease opportunity | identity_collapse |
| Ginger Beer €575/L | Latent if matched | volume_parse |

---

## 6. Supplier Intelligence Bugs

- `buildSupplierIntelligence` compares latest vs 90d min/avg **per ingredient_id** — mixed pack formats → false spike and "better supplier" lines
- `buildSupplierWatchlist` aggregates history % without format guard
- 14 ghost history rows inflate supplier movement counts

---

## VL Invoice DB State

| Invoice | Items | History rows | Stale |
|---------|-------|--------------|-------|
| Bidfood | 11 | 1 | no |
| Aviludo April | 9 | 10 | no |
| Aviludo May | 8 | 1 | yes |
| Bocconcino | 7 | 1 | yes |
| Emporio (live) | 8 | 0 | yes |
| Mammafiore | 8 | 0 | yes |

---

## Classification

| Class | Count |
|-------|-------|
| Math/logic (synthesis code) | 0 |
| Stale DB | 4 VL invoices |
| Identity collapse | 2 proven |
| Volume parse | 1 latent |
| Mock dashboard | 1 route |

---

## Recommendations

- Fix ingredient identity (pack variants) before trusting opportunities
- Block cross-format price_history chaining in synthesis inputs
- VL re-read to refresh stale DB
- Wire home dashboard to real data or hide mock KPIs
- Ginger Beer volume parse guard

---

## Artifacts

| File | Contents |
|------|----------|
| `dashboard-audit.json` | Routes, weekly snapshot, purchasing metrics, VL coverage |
| `opportunities-audit.json` | Alerts, owner review opportunities, proven bugs |
| `supplier-intelligence-audit.json` | Watchlist, per-ingredient intel |
| `executive-summary.json` | Production safety verdict |
| `run-audit.mts` | Reproducible harness |
