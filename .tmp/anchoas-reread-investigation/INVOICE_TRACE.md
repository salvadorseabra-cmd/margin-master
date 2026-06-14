# Invoice Item Trace — Anchoas Re-Read Investigation

**Generated:** 2026-06-14  
**Invoice:** Aviludo April · `c2f52357-0f80-491a-ba14-c97ff4837472`  
**Supplier:** AVILUDO  
**Invoice date:** 2026-04-17 (17/04/2026)  
**Mode:** READ-ONLY investigation (live VL query)

---

## Current Anchovas Line (post re-read)

| Field | Value |
|-------|-------|
| **invoice_id** | `c2f52357-0f80-491a-ba14-c97ff4837472` |
| **invoice_item_id** | `69d22f75-87a0-430b-926a-ed4be27ce1c5` |
| **raw name** | `Filete de Anchovas Alconfi sta Lt 495 g` |
| **normalized name** | `filete de anchovas alconfi sta` |
| **created_at** | `2026-06-14T15:28:29Z` |
| **displayState** | `unmatched` |

---

## invoice_item_matches Row

| Field | Value |
|-------|-------|
| **status** | `unmatched` |
| **match_kind** | `null` |
| **ingredient_id** | `null` |

Shadow seed ran and correctly persisted `unmatched` — consistent with virtual matcher output.

---

## Invoice Summary After Re-Read

| Metric | Value |
|--------|-------|
| Total lines | 9 |
| Confirmed | 8 |
| Unmatched | 1 (Anchovas) |

All 8 confirmed lines use `match_kind: confirmed-override` from prior manual review — **not** alias-only rematch.

---

## All Aviludo April Match Rows (live)

| Line (abbrev.) | match_kind | status | ingredient |
|----------------|------------|--------|------------|
| 8 product lines | `confirmed-override` | `confirmed` | various |
| Filete de Anchovas Alconfi sta… | `null` | `unmatched` | `null` |

The 8 rematched lines restored via **confirmed-override** keys tied to prior review sessions. Anchovas has no override for the current OCR key and no alias for `Alconfi sta`.

---

## Price History Note

Price history row `952119dc…` exists for April Anchoas on ingredient `c811f67f-df4d-4194-ba8b-7a15d4af38bd` but is a **ghost** — pricing without a confirmed line match on the April invoice. The canonical ingredient was created from May review; April had never auto-matched before this re-read.

---

## Matcher Explanation (current line)

For `Filete de Anchovas Alconfi sta Lt 495 g`:

1. No user override key
2. No operational alias hit
3. No confirmed DB alias hit (`AVILUDO::filete de anchovas alconfi sta 495` absent from map)
4. No operational memory hit
5. Semantic tier rejected Anchoas (`no_safe_family_convergence`, score below threshold)

Result: `unmatched` — correctly seeded by lifecycle shadow.
