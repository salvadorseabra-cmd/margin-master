# Pepino Live Validation — Final Verdict

**Queried:** 2026-06-14T14:36Z  
**VL project:** bjhnlrgodcqoyzddbpbd

## Verdict: **PARTIALLY_VALIDATED**

| Flow | Status |
|------|--------|
| Baseline snapshot | **DONE** (live DB) |
| Unmatch (conserva cleanup) | **Strong DB evidence** — likely already executed today |
| Reassign (conserva → fresco) | **NOT DONE** — no fresco ingredient; line already unmatched |
| Reassign again (fresco → conserva) | **NOT DONE** |
| Reject pairs | **UNVERIFIED** (localStorage only) |

---

## PROVEN FACTS

- Live baseline captured from VL DB at 2026-06-14T14:36Z
- Bidfood invoice: `da472b7f-0fd9-4a26-a37c-80ad335f7f7e`
- **Current Pepino line:** `aca361a1-ad60-43fa-9cc4-1345b7d45af3` (NOT `514feb41…`)
- Pepino conserva: `635a1189-36ea-4ff2-9012-8172ab1ab81d`
- Pepino match: `status=unmatched`, `ingredient_id=null`, `previous_ingredient_id=635a1189…`, `corrected_at=2026-06-14T14:17:26Z`
- Poison row `a689bd91-5b83-41d9-b060-b5a63ccfb3b4`: **DELETED** (0 rows)
- Conserva history: 2 jar rows only; **no Bidfood row**
- Conserva `current_price`: 3748.333…; `updated_at` matches unmatch timestamp
- **No Pepino fresco** in catalog — only "Pepino conserva"
- Pepino aliases: 5 jar aliases → conserva; no bare "pepino" alias
- Match coverage: 51/51 items, **0 orphans**, **0 duplicates**
- Bidfood `ingredient_price_history`: **0 rows** for any ingredient
- Env flags: `SHADOW_SEED=true`, `DUAL_WRITE=true`, `EXTRACT_GATE` default ON, `READ_CUTOVER` **not set (OFF)**

---

## INFERENCES

- Unmatch subtractive pricing **worked** on live VL: poison deleted, jar chain intact, `previous_ingredient_id` tombstoned
- Bidfood re-extract with extract gate ON seeded all 11 lines as `unmatched` (no auto-confirm to conserva on this pass)
- Pepino was briefly matched to conserva between re-extract (`14:15:56`) and unmatch (`14:17:26`) — user or automated confirm/correct path
- Reassign validation requires **creating "Pepino fresco"** first (unit tests use mock ID `f1f0e0d0-c000-4000-8000-000000000001`)
- Reassign flows untested live (wrong starting state + missing fresco ingredient)

---

## UNVERIFIED

- Reject pair for Pepino → conserva (`ingredient-correction-memory` localStorage, not in DB)
- UI display state (READ_CUTOVER OFF — may still use virtual matcher)
- Whether conserva is blocked from re-suggestion in picker (needs browser check)
- Reassign A→B and B→A round-trip on live VL

---

## Next manual steps

1. Confirm match Pepino → conserva (re-seed contamination)
2. Create Pepino fresco ingredient (kg)
3. Reassign conserva → fresco → run `npx vite-node scripts/validate-pepino-lifecycle.mts after-step`
4. Reassign fresco → conserva → run re-query script again
5. Check browser localStorage for reject pairs
