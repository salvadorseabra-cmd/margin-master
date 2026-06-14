# Anchovas Trace — Invoice Item History Across Re-Reads

**Generated:** 2026-06-14  
**Invoice:** Aviludo April · `c2f52357-0f80-491a-ba14-c97ff4837472`  
**Supplier:** AVILUDO  
**Ingredient:** Anchoas · `c811f67f-df4d-4194-ba8b-7a15d4af38bd`  
**Mode:** READ-ONLY (live VL + prior investigation artifacts)

---

## Current State (Post-OCR Hardening Era, Live Query)

| Field | Value |
|-------|-------|
| **invoice_item_id** | `a1ff870a-a6a0-48b1-be57-af8e02f5c532` (new UUID from 17:15Z re-read) |
| **OCR name** | `Filete de Anchovas Alconfrista Lt 495 g` |
| **match status** | `confirmed` |
| **match_kind** | `confirmed-override` |
| **ingredient_id** | `c811f67f-df4d-4194-ba8b-7a15d4af38bd` |
| **Invoice summary** | 9/9 lines confirmed, all via `confirmed-override` |
| **Anchoas alias count** | 10 |

---

## Historical invoice_item_id Churn

Re-read CASCADE-deletes items; each re-read produces new UUIDs. Prior confirmations are **not** linked by item ID — only by alias/override keys matching fresh OCR.

| Phase | invoice_item_id | OCR text | Match outcome |
|-------|-----------------|----------|---------------|
| Pre re-read (prior session) | `e57a3591…` era | `…Alconfrisa Lt 495 g` | Would hit alias → matched |
| Re-read ~15:28Z | `69d22f75-87a0-430b-926a-ed4be27ce1c5` | `…Alconfi sta Lt 495 g` | **unmatched** (no alias yet) |
| User confirm ~15:38Z | same item | — | Alias added for `Alconfi sta` |
| User confirm ~15:39Z | — | — | Alias added for `Alconfrista` |
| Re-read ~17:15Z | `a1ff870a-a6a0-48b1-be57-af8e02f5c532` | `…Alconfrista Lt 495 g` | **confirmed-override** (alias hit) |

---

## Match Outcome Timeline

```
Pre-hardening era:
  OCR variants flip (Alconfrisa ↔ Alconfi sta ↔ Alconfirsta ↔ …)
  → alias hit/miss toggles per re-read
  → same invoice appears matched OR unmatched unpredictably

OCR hardening deployed (temperature=0, seed=42):
  Stability tests: 5/5 runs → "Filete de Anchoas Alconfirosa LI 495 g"
  → Alconfirosa has NO alias → would be UNMATCHED on re-read

Live re-read at 17:15Z (actual VL extract, not stability script):
  OCR → "Filete de Anchovas Alconfrista Lt 495 g" (not Alconfirosa)
  → Alconfrista alias exists (added 15:39Z) → MATCHED

Paradox persists in principle:
  If next re-read produces Alconfirosa (hardening-stable spelling) → UNMATCHED
  If re-read produces Alconfrista or Alconfi sta → MATCHED
```

---

## Shadow Seed Behavior

After re-read, `shadowSeedInvoiceItemMatches` runs `findInvoiceItemIngredientMatch` per line and persists result:

| Virtual matcher output | Persisted status | match_kind |
|------------------------|------------------|------------|
| Alias/override hit | `confirmed` | `confirmed-override` or `confirmed-alias` |
| No hit | `unmatched` | `null` |

At 15:28Z re-read with `Alconfi sta`: shadow correctly seeded `unmatched` — consistent with virtual layer.

At 17:15Z re-read with `Alconfrista`: shadow seeded `confirmed` / `confirmed-override` — consistent.

---

## Other Aviludo Lines (Stable Across Re-Reads)

8 non-Anchovas lines rematch via **confirmed-override** keys from prior manual review sessions. Their OCR text is stable enough that override keys persist across re-reads.

Anchovas is the outlier because brand-token OCR varies (pre-hardening) or stabilizes to a spelling outside alias set (post-hardening `Alconfirosa`).

---

## Price History Ghost

| id | invoice_id | new_price | note |
|----|------------|-----------|------|
| `952119dc-8645-4a5f-a3ff-191ae1a57ea8` | Aviludo April | 4.745 | Pricing row exists without prior confirmed line match on April invoice |

Canonical Anchoas ingredient created from May review; April had never auto-matched before early re-reads.

---

## Matcher Simulation vs Live OCR

| Test OCR (simulated) | Live alias set (10 rows) | Result |
|----------------------|---------------------------|--------|
| `Alconfirosa LI` (hardening output) | No key | **unmatched** |
| `Alconfrista Lt` (current live) | `AVILUDO::filete de anchovas alconfrista 495` | **confirmed-override** |
| `Alconfi sta Lt` | `AVILUDO::filete de anchovas alconfi sta 495` | **confirmed** |
| `Alconfrisa Lt` | `AVILUDO::filete de anchovas alconfrisa 495` | **confirmed** |
| `Alconfirsta L1` | No key | **unmatched** |

---

## Conclusion

Anchovas match outcome across re-reads is fully explained by:

1. Fresh OCR text → exact alias/override key lookup
2. Per-variant alias accumulation (whack-a-mole)
3. OCR hardening stabilizing to `Alconfirosa` — a spelling never manually confirmed
4. T8 no-preserve: item UUIDs churn; only memory keys matter

No evidence of persistence failure or matcher non-determinism.
