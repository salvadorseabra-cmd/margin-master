# Repair Actions — Historical Pricing Repair Phase 4A (Mozzarella)

**Executed:** 2026-06-15 · VL project `bjhnlrgodcqoyzddbpbd`  
**Script:** `scripts/repair-mozzarella-history.mts --execute`  
**Pre-repair checkpoint commit:** `72eee2d`

---

## Scope guard

| Check | Result |
|---|---|
| VL project ref | `bjhnlrgodcqoyzddbpbd` ✅ |
| Ingredient ID | `2a99cecd-08fb-48d5-87cf-cc9ea5282a6d` ✅ |
| Rows before | 3 |
| Rows deleted | **2 only** |
| Rows after | 1 |
| Unexpected rows touched | **0** |

---

## Rows deleted (2)

| ID | Class | Invoice | Date | Op € | Reason |
|---|---|---|---|---|---|
| `9ee1b793-974d-4a6b-b656-c7b5e8febfaa` | DUPLICATE | `c2f52357-0f80-491a-ba14-c97ff4837472` | 2026-04-17 | 13.69 | Second insert for same `(invoice_id, ingredient_id)` |
| `18bdb0c5-0370-4bc7-878d-85957b8ba946` | POISON | `f0aa5a08-86a3-4938-99f0-711e86073968` | 2026-05-08 | 0.812 | Suggested/semantic Bocconcino 125g×8 — wrong pack contract |

**Delete results:** both `ok: true` (exactly 1 row each, guarded by `ingredient_id`).

---

## Row kept (1)

| ID | Class | Invoice | Date | Op € | Prev |
|---|---|---|---|---|---|
| `3c508a43-68bd-4b69-9205-61ddbbfb26a7` | VALID | `c2f52357-0f80-491a-ba14-c97ff4837472` | 2026-04-17 | 13.69 | null |

---

## Backup

Deleted rows backed up before execute:

`scripts/backups/mozzarella-phase4a-pre-delete-2026-06-14T23-16-06.json`

- Contains full row payloads for both DELETE ids
- `id_hash`: `b9a8c62f3f22b897`

---

## Post-delete reconciliation

`reconcileIngredientPriceHistoryChain(client, MOZZARELLA_ID)`:

| Field | Value |
|---|---|
| `orphansDeleted` | 0 |
| `rowsUpdated` | 0 |
| `linkedRowCount` | 1 |
| `errors` | [] |

Single surviving bootstrap row — chain already correct (`previous_price=null`).

`revertIngredientCurrentPriceFromHistory`: **not invoked** — catalog operational (13.69) already matched latest history after delete.

---

## Not in scope (unchanged)

- Atum denominator rows
- created_at corruption (7 rows on `3b4cb21f`)
- Anchoas/Gema multi-`un` lines
- Any other ingredient history rows
- Invoice item matches (Bocconcino remains `suggested`; only history row removed)
