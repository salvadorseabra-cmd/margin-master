# Before State — Historical Pricing Repair Phase 4A (Mozzarella)

**Queried:** VL project `bjhnlrgodcqoyzddbpbd` · 2026-06-15  
**Mode:** Pre-repair scope validation (no data changes yet)

**Ingredient:** Mozzarella fior di latte · `2a99cecd-08fb-48d5-87cf-cc9ea5282a6d`

---

## Scope reconciliation vs Phase 3

| Check | Expected (Phase 3) | Live (2026-06-15) | Match |
|---|---|---|---|
| Ingredient ID | `2a99cecd-08fb-48d5-87cf-cc9ea5282a6d` | same | ✅ |
| KEEP row | `3c508a43-68bd-4b69-9205-61ddbbfb26a7` | present | ✅ |
| DELETE duplicate | `9ee1b793-974d-4a6b-b656-c7b5e8febfaa` | present | ✅ |
| DELETE poison | `18bdb0c5-0370-4bc7-878d-85957b8ba946` | present | ✅ |
| History row count | 3 | 3 | ✅ |
| `keep_present` | true | true | ✅ |
| `delete_present` | true | true | ✅ |

**Verdict:** Scope unchanged from Phase 3 — safe to proceed with Mozzarella-only deletes.

---

## Catalog

| Field | Value |
|---|---|
| `current_price` | 13.69 |
| `purchase_quantity` | 1 |
| `unit` | un |
| Operational € | **13.69** |

---

## History rows (3)

| ID | Class | Invoice | Date | Supplier | Match | Line | Op € | Prev | Δ% |
|---|---|---|---|---|---|---|---|---|---|
| `3c508a43` | **VALID (KEEP)** | `c2f52357` | 2026-04-17 | AVILUDO | confirmed | Mozzarella Flor di Latte 2Kg | 13.69 | null | — |
| `9ee1b793` | **DUPLICATE (DELETE)** | `c2f52357` | 2026-04-17 | AVILUDO | confirmed | same | 13.69 | 13.69 | 0% |
| `18bdb0c5` | **POISON (DELETE)** | `f0aa5a08` | 2026-05-08 | IL BOCCONCINO | suggested/semantic | MOZZARELLA 125GR×8 qty 10 @ 8.12 | **0.812** | null | — |

---

## Contamination signals

| Metric | Before value | Correct? |
|---|---|---|
| `fetchLatestHistoryNewPrice` (created_at DESC) | **0.812** (`18bdb0c5`) | ❌ poison wins sort |
| `latest_history_operational` (validation script) | **0.812** | ❌ |
| `current_price_from_latest_history` | **false** | ❌ |
| Catalog `current_price` | 13.69 | ✅ (confirmed Aviludo persist) |
| Latest confirmed purchase | Apr Aviludo 2Kg · €13.69 | ✅ |

---

## Matches

| Item | Invoice | Status | Kind |
|---|---|---|---|
| `2ef47b45` | `c2f52357` | confirmed | confirmed-override |
| `ec1932a2` | `f0aa5a08` | suggested | semantic |

---

## Planned repair (Phase 4A only)

- **DELETE:** `9ee1b793-974d-4a6b-b656-c7b5e8febfaa`, `18bdb0c5-0370-4bc7-878d-85957b8ba946`
- **KEEP:** `3c508a43-68bd-4b69-9205-61ddbbfb26a7`
- **NOT IN SCOPE:** Atum, created_at, Anchoas/Gema, any other ingredient

---

## Validation commands run

```bash
npx vite-node scripts/validate-repair-scope.mts
npx vite-node scripts/validate-historical-pricing.mts
```
