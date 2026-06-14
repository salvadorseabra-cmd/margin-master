# Root Cause — Anchovas Persistence Paradox

**Generated:** 2026-06-14  
**Investigation:** Anchovas persistence paradox  
**Verdict tag:** `ALIAS_KEY_GAP_AFTER_OCR_STABILIZATION`  
**Mode:** READ-ONLY

---

## Executive Summary

The paradox — same invoice, repeated re-reads, same user confirmation, sometimes auto-matches Anchovas and sometimes does not — is **real but expected**. Persistence works correctly. Recall on re-read is **exact-key gated**. The dominant failure mode shifted after OCR hardening from OCR non-determinism to **stable OCR spelling ∉ alias set**.

**Not a bug** in save path, MLS dual-write, or matcher. **Design limitation:** exact-key alias/override memory without fuzzy brand-token canonicalization or T8 preserve policy.

---

## Hypothesis Classification

| Hypothesis | Verdict | Evidence |
|------------|---------|----------|
| Alias key missing for new OCR variant despite hardening | **YES — PRIMARY (post-hardening)** | Hardening locks to `Alconfirosa`; no alias row → live matcher returns unmatched |
| confirmed-override vs confirmed-alias difference | **Cosmetic only** | Same keys; override checked first; both require exact match |
| Pepino exact match vs Anchovas alias-only | **YES — contributing** | Pepino: stable `"Pepino"` + override/exact; Anchovas: alias/override only |
| User action creates alias for one variant, re-read produces different variant | **YES — PRIMARY (pre-hardening); still possible post-hardening** | Whack-a-mole: 10 aliases, each for one spelling; `Alconfirosa` never confirmed |
| T8 no preserve policy | **YES — contributing** | Re-read CASCADE-deletes items/matches; no carry-forward of prior item UUID confirmations |
| Persistence / MLS bug | **NO** | Aliases persist to `ingredient_aliases`; MLS dual-write fires; live DB confirms rows |
| Matcher bug / non-determinism | **NO** | Same OCR + memory snapshot → identical output every time |
| Race condition on save | **NO** | `aliasPersistQueue` serializes writes; investigation found no race |

---

## Era Classification

### Pre-OCR-Hardening: `OCR_NON_DETERMINISTIC`

- Brand token flipped across re-reads (`Alconfrisa` ↔ `Alconfi sta` ↔ `Alconfirsta` ↔ …)
- User confirm saved alias for **session's spelling only**
- Next re-read with different spelling → alias miss → unmatched
- Appeared as "persistence didn't work" but was **recall key mismatch**

### Post-OCR-Hardening: `ALIAS_KEY_GAP_AFTER_OCR_STABILIZATION`

- OCR stabilized (5/5 runs → `Alconfirosa`) via `temperature=0`, `seed=42`
- **`Alconfirosa` has no alias row** → auto-match still fails on re-read
- User confirms other variants (`Alconfrista`, `Alconfi sta`) → those spellings match
- Paradox **persists in principle** at new stable spelling outside alias set

---

## Mechanism Diagram

```
User confirms Anchovas → Anchoas
  │
  ├─ WRITE (works): ingredient_aliases + override + operational + MLS
  │     key = AVILUDO::normalize(exact OCR at confirm time)
  │
  └─ RE-READ
        │
        ├─ Fresh OCR text
        ├─ Normalize → lookup key
        │
        ├─ Key EXISTS in alias/override set?
        │     YES → confirmed-override → MATCHED ✅
        │     NO  → semantic rejected → UNMATCHED ❌
        │
        └─ (T8: prior invoice_item_id irrelevant)
```

---

## Why "Ingredient mapping saved" Misleads

The toast confirms **write success**, not **future recall coverage**:

- Save creates alias for **one normalized key**
- Re-read produces **potentially different normalized key**
- No cross-variant brand canonicalization
- No fuzzy alias lookup for Anchoas brand tokens

User interprets: "I confirmed this line, it should always match."  
System behavior: "I confirmed **this spelling**, only this spelling auto-matches."

---

## Contributing Factors (Ranked)

1. **Exact-key alias model** — no brand-token canonicalization
2. **OCR variant churn** (pre-hardening) or **stable uncovered spelling** (post-hardening)
3. **Per-variant whack-a-mole** — 10 aliases, none for `Alconfirosa`
4. **T8 no preserve** — item UUID churn; memory keys only
5. **Pepino contrast** — stable short text masks same architectural limitation

---

## Recommended Fixes (Guidance Only — No Code Changes Made)

| Priority | Fix | Addresses |
|----------|-----|-----------|
| Stopgap | Add alias for hardened spelling `Alconfirosa` | Immediate recall for current stable OCR |
| Medium | Brand-token canonicalization before alias lookup | Cross-variant recall without per-spelling confirms |
| Medium | T8 preserve policy — carry forward user confirmations across re-read | Item UUID churn |
| Diagnostic | Enable `READ_CUTOVER` when testing persisted vs virtual drift | Pepino-class UI confusion |

---

## Conclusion

Root cause is **`ALIAS_KEY_GAP_AFTER_OCR_STABILIZATION`**: persistence is correct; recall fails when normalized OCR text does not hit an exact alias/override key. Pre-hardening, OCR non-determinism caused key churn. Post-hardening, OCR is stable but at a spelling never manually confirmed.
