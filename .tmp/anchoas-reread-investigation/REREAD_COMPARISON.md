# Re-Read Comparison — Anchoas Re-Read Investigation

**Generated:** 2026-06-14  
**Invoice:** Aviludo April · `c2f52357-0f80-491a-ba14-c97ff4837472`  
**Mode:** READ-ONLY investigation

---

## Invoice Item History Across Audits

| Snapshot | invoice_item_id | OCR text | Match state |
|----------|-----------------|----------|-------------|
| Jun 10 audit | `fea28903…` | `Filete de Anchovas Alconfrisa Lt 495 g` | alias-eligible |
| Jun 12 audit | `ebe7d09a…` | `Filete de Anchovas Alconfrisa Lt 495 g` | alias-eligible |
| Phase4a (earlier today) | `6f416cf6…` | `Filete de Anchovas Alconfirsta L1 495 g` | unmatched |
| **Live after re-read** | `69d22f75-87a0-430b-926a-ed4be27ce1c5` | `Filete de Anchovas Alconfi sta Lt 495 g` | unmatched |

Each re-read deletes and re-inserts invoice items — new UUIDs each time.

---

## OCR Text Drift

| Aspect | Before (Jun 10–12) | After (Jun 14 re-read) |
|--------|--------------------|------------------------|
| Brand token | `Alconfrisa` | `Alconfi sta` |
| Normalized | `filete de anchovas alconfrisa` | `filete de anchovas alconfi sta` |
| Alias key | `AVILUDO::filete de anchovas alconfrisa 495` | `AVILUDO::filete de anchovas alconfi sta 495` |
| Alias hit | ✅ YES | ❌ NO |

**Root drift:** space inserted mid-word in brand name — classic VL OCR instability on supplier product tokens.

---

## Normalization Differences

Both variants normalize through the same pipeline (`normalizeInvoiceIngredientName`). The difference is entirely in the raw OCR tokens:

- `Alconfrisa` → token preserved as single word → matches stored alias
- `Alconfi sta` → two tokens → new lookup key with no alias row

No normalization rule collapses spaced brand variants back to `alconfrisa`.

---

## Alias Resolution Differences

| Spelling | Step 3 (confirmed alias) | Final |
|----------|--------------------------|-------|
| `Alconfrisa` | HIT → Anchoas | `confirmed-alias` |
| `Alconfi sta` | MISS | `unmatched` |
| `Alconfirsta` | MISS | `unmatched` |

---

## Did Re-Read Change Text Enough to Break Matching?

**YES.**

The Jun 14 re-read changed the brand token from `Alconfrisa` (alias-covered) to `Alconfi sta` (alias-uncovered). That single OCR drift is sufficient to break exact-key alias matching.

---

## Prior Context: April Never Auto-Matched

Even before this re-read, phase4a audits showed Anchovas as **unmatched** on variants like `Alconfirsta`. The canonical ingredient existed and aliases existed for *some* spellings, but the April line had never received a confirmed match — only May had a linked purchase.

The ghost price history row (`952119dc…`) reflects pricing activity without a confirmed April line match.

---

## OCR Stability Reference

Known VL failure mode documented in `.tmp/vl-ocr-rc/ocr-stability-runs.json` — many Anchovas brand-token variants across re-reads. This case is consistent with that pattern.

---

## Conclusion

Re-read did not "break" a previously confirmed April match via lifecycle — it produced a new OCR variant that misses the one alias spelling that would have matched (`Alconfrisa`). The 8 other lines rematched via **confirmed-override**, not aliases.
