# Anchovas Extraction History

**Generated:** 2026-06-14  
**Mode:** READ-ONLY investigation  
**Live DB queried:** 2026-06-14T16:05Z via `scripts/validate-anchoas-reread.mts`  
**Invoice:** Aviludo April · `c2f52357-0f80-491a-ba14-c97ff4837472`  
**Ingredient:** Anchoas · `c811f67f-df4d-4194-ba8b-7a15d4af38bd`

---

## Summary

Multiple distinct OCR variants have been produced for the same Anchovas line across re-reads and stability runs. Match outcome toggles based on whether the OCR brand token hits an exact alias key. The alias map has grown over time as users manually confirm new variants (8 aliases at start of investigation → 10+ by end of session).

---

## Historical OCR Variants (Audits + Live DB)

| Timestamp / snapshot | invoice_item_id | Raw OCR text | Normalized key | Match result |
|----------------------|-----------------|--------------|----------------|--------------|
| Jun 10 audit | `fea28903…` | `Filete de Anchovas Alconfrisa Lt 495 g` | `AVILUDO::filete de anchovas alconfrisa 495` | alias HIT → matched |
| Jun 12 audit | `ebe7d09a…` | `Filete de Anchovas Alconfrisa Lt 495 g` | same | alias HIT → matched |
| Re-read #1 (phase4a) | `6f416cf6…` | `Filete de Anchovas Alconfirsta L1 495 g` | `…alconfirsta l1` / `…alconfirsta 495` | **MISS → unmatched** |
| Re-read #2 | `69d22f75…` | `Filete de Anchovas Alconfi sta Lt 495 g` | `AVILUDO::filete de anchovas alconfi sta 495` | **MISS** (at time) → unmatched |
| Re-read #3 (~15:43Z) | `4c54f26b…` | `Filete de Anchovas Alconfrisa Lt 495 g` | `…alconfrisa 495` | alias HIT → **matched** |
| Re-read #4+ (~16:03Z) | `44b26701…` | `Filete de Anchovas Alconfrista Lt 495 g` | `AVILUDO::filete de anchovas alconfrista 495` | alias HIT → **confirmed** (persisted as `confirmed-override`) |

Sources: `.tmp/anchoas-reread-investigation/REREAD_COMPARISON.md`, `.tmp/reread-determinism-investigation/INVOICE_ITEM_AUDIT.md`, live DB queries.

---

## Five Re-Read Flip Pattern (Validation Lab)

User-reported pattern on same AVILUDO invoice:

| Re-read | Expected outcome | OCR driver |
|---------|------------------|------------|
| #1 | unmatched | Variant landed on miss key (e.g. `Alconfirsta`) |
| #2 | matched | Variant landed on hit key (e.g. `Alconfrisa` or newly added alias) |
| #3 | matched | Hit key again |
| #4 | unmatched | New miss variant (e.g. before `Alconfrista` alias added) |
| #5 | matched | Hit key (e.g. `Alconfrista` after manual confirm) |

Pattern is consistent with **OCR variant roulette + exact-key alias lookup**, not matcher non-determinism.

---

## Current Live State (16:03Z batch)

- **Item count:** 9 lines
- **Anchovas OCR:** `Filete de Anchovas Alconfrista Lt 495 g`
- **Persisted match:** `confirmed` (via `confirmed-override`)
- **Item ID:** `44b26701…` (new UUID — prior items deleted on each re-read)

---

## Stability Run Variants

From `.tmp/vl-ocr-rc/ocr-stability-runs.json` — brand tokens observed on identical source PDF:

| Variant family | Examples |
|----------------|----------|
| Alfons- | `Alfonsica Ll`, `Alfonsoita LI`, `Alfonsica Li` |
| Alconfi- | `Alconfirosa`, `Alconfi osa`, `Alconfiosta`, `Alconfiosa` |
| Alco- | `Alcofiorisa`, `Alcofrissa`, `Alconfiorsa` |
| Alcon- | `Alconfrisa`, `Alconfirsta`, `Alconfrista`, `Alconfi sta` |

**20+ distinct brand spellings** from the same underlying invoice image across crop modes and runs.

---

## Alias Map Evolution Mid-Session

Aliases added during investigation session (manual confirms):

| Time | Alias added | Enables match for |
|------|-------------|-------------------|
| ~15:38Z | `Alconfi sta` variant | Re-read #2 spelling |
| ~16:03Z | `Alconfrista` variant | Re-read #4+ spelling |

Each manual confirm adds one exact key. Whack-a-mole — does not prevent future OCR variants from missing.

---

## Normalization Pipeline

Both matched and unmatched variants pass through the same normalization:

```
raw OCR text
  → normalizeInvoiceIngredientName()
  → buildOverrideKeysFromInvoiceLine() / normalizeOperationalAliasKey()
  → lookupIngredientIdFromAliasMap(supplier, keys)
```

The difference is entirely in raw OCR tokens — no rule collapses `alconfi sta` ↔ `alconfrisa`.

---

## Related Audits

- `.tmp/anchoas-reread-investigation/ALIAS_AUDIT.md` — alias row inventory
- `.tmp/anchoas-reread-investigation/REREAD_COMPARISON.md` — before/after drift
- `.tmp/reread-determinism-investigation/ANCHOAS_PEPINO_COMPARISON.md` — Pepino contrast (stable OCR)
