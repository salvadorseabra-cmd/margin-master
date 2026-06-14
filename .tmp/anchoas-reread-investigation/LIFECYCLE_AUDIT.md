# Match Lifecycle Audit — Anchoas Re-Read Investigation

**Generated:** 2026-06-14  
**Invoice:** Aviludo April · `c2f52357-0f80-491a-ba14-c97ff4837472`  
**Anchovas item:** `69d22f75-87a0-430b-926a-ed4be27ce1c5`  
**Mode:** READ-ONLY investigation

---

## Lifecycle Checks

| Check | Result | Notes |
|-------|--------|-------|
| Shadow seed ran? | ✅ YES | Row exists for new item `69d22f75…` |
| Seeded status correct? | ✅ YES | `unmatched` matches virtual matcher |
| CASCADE on re-read? | ✅ YES | Old item UUIDs replaced (e.g. `6f416cf6…`, `ebe7d09a…`) |
| Reject pair blocking? | ❌ NO | No server-side evidence; pairs in localStorage only |
| Lifecycle state blocking? | ❌ NO | Correctly seeded as `unmatched` |
| Operational memory blocking? | ❌ NO | No hit for current OCR key |
| Override restoring match? | ❌ NO | No override key for `Alconfi sta` variant |

---

## invoice_item_matches State

| Field | Value |
|-------|-------|
| invoice_item_id | `69d22f75-87a0-430b-926a-ed4be27ce1c5` |
| status | `unmatched` |
| match_kind | `null` |
| ingredient_id | `null` |

Persisted state matches virtual matcher output — no lifecycle drift.

---

## Why 8 Other Lines Rematched

All 8 confirmed Aviludo April lines after re-read:

| match_kind | count |
|------------|-------|
| `confirmed-override` | 8 |
| `confirmed-alias` | 0 |

These lines were manually confirmed in prior review sessions. Override keys survive re-read because they are keyed to normalized product identity from prior confirmation — independent of minor OCR drift on non-brand tokens.

Anchovas differs:

- Has **confirmed aliases** for other spellings (`Alconfrisa`, `Alconfiosa`, etc.)
- Has **no confirmed-override** for the current `Alconfi sta` OCR key
- Current OCR variant has **no alias row**

---

## Alias Memory

| Item | State |
|------|-------|
| Total VL confirmed aliases | 33 |
| Anchoas alias count | 8 |
| Alias for `Alconfrisa` | ✅ exists |
| Alias for `Alconfi sta` | ❌ missing |

Alias memory is exact-key. Lifecycle does not synthesize aliases from sibling spellings.

---

## Reject Pairs

Reject pairs (`isRejectedIngredientCandidate`) are stored client-side in browser localStorage. No server-side reject-pair table was found blocking this rematch. Not a factor in this investigation.

---

## Re-Read Preserve Policy

Per `.tmp/match-lifecycle-activation-validation/REREAD_VALIDATION.md`, a T8 preserve policy (carry forward prior `confirmed` matches on re-read) is **not implemented**. Re-read always re-runs the full matcher pipeline on fresh OCR text.

---

## Is Something Actively Preventing Rematch?

**NO.**

Lifecycle plumbing behaved correctly:

1. Re-extracted 9 lines
2. Ran matcher on each
3. Seeded 8 `confirmed` (override) + 1 `unmatched` (Anchovas)

The unmatched state is the **correct outcome** given current OCR text and alias map — not a lifecycle bug.

---

## Conclusion

No lifecycle, shadow-seed, reject-pair, or operational-memory mechanism blocked rematch. The failure originates upstream in OCR → alias key mismatch, not downstream in persistence.
