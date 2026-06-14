# Invoice Item Audit — Last 3 Re-Reads

**Generated:** 2026-06-14  
**Mode:** READ-ONLY investigation  
**Live queries:** 2026-06-14T15:45–15:46Z  
**Related audits:** `.tmp/anchoas-reread-investigation/REREAD_COMPARISON.md`, `.tmp/match-lifecycle-phase4a-validation/audit-results.json`, `.tmp/pepino-live-validation/baseline.json`

---

## Summary

Items are **recreated differently on every re-read**: new UUIDs, different OCR strings, fresh match rows from shadow seed. Matching outcome is a function of OCR variant × alias map at seed time, not prior item identity.

---

## Aviludo April — Anchovas (`c2f52357-0f80-491a-ba14-c97ff4837472`)

| Re-read | `invoice_item_id` | OCR text | Persisted match | Virtual `displayState` |
|---------|-------------------|----------|-----------------|------------------------|
| **#1** (phase4a) | `6f416cf6…` | `…Alconfirsta L1…` | `unmatched` | `unmatched` |
| **#2** (anchoas audit) | `69d22f75…` | `…Alconfi sta…` | `unmatched` | `unmatched` |
| **#3** (live 15:43Z) | `4c54f26b…` | `…Alconfrisa…` | `confirmed` / `confirmed-override` | `confirmed` |

### Observations

- Each re-read: **delete all items → insert 9 new UUIDs** (latest batch timestamp `15:43:05Z`).
- OCR brand token changes every re-read: `Alconfirsta` → `Alconfi sta` → `Alconfrisa`.
- Alias lookup is **exact-key** on normalized text + supplier prefix. Hit/miss depends on exact OCR spelling.
- After re-read #2, manual confirm added alias `AVILUDO::filete de anchovas alconfi sta 495` (created `15:38:37Z`).
- Re-read #3 got `Alconfrisa` OCR plus override restoration for 8 sibling lines.

### Historical item IDs (from audit extracts)

| Snapshot | Item ID | OCR variant |
|----------|---------|-------------|
| Jun 10 audit | `fea28903…` | `Alconfrisa` |
| Jun 12 audit | `ebe7d09a…` | `Alconfrisa` |
| Phase4a | `6f416cf6…` | `Alconfirsta` |
| Anchoas audit | `69d22f75…` | `Alconfi sta` |
| Live (latest) | `4c54f26b…` | `Alconfrisa` |

---

## Bidfood — Pepino (`da472b7f-0fd9-4a26-a37c-80ad335f7f7e`)

| Re-read | `invoice_item_id` | Line text | Persisted | Virtual (READ_CUTOVER OFF) |
|---------|-------------------|-----------|-----------|----------------------------|
| **#1** (~10:53) | `514feb41…` | `Pepino` | `suggested` / `exact` | **`confirmed`** |
| **#2** (~14:15) | `aca361a1…` | `Pepino` | `unmatched` (user unmatch 14:17) | **`confirmed`** unless reject pair hydrated |
| **#3** (~14:52+) | `300fe59b…` | `Pepino` | `confirmed` → Pepino **fresco** | depends on catalog/reject state |

### Observations

- Line text `"Pepino"` is **OCR-stable** — same string across re-reads.
- Persisted status varies due to **user actions** (unmatch at 14:17) and **reassignment** (Pepino fresco), not OCR drift.
- Virtual display shows `confirmed` for bare `exact` match to Pepino conserva (`635a1189…`) regardless of persisted `suggested`/`unmatched`.
- Obsolete Pepino item IDs tracked in `.tmp/pepino-live-validation/baseline.json`: `514feb41…`, `8e9e727a…`.

---

## Pattern Mapping (User-Reported A/B/C)

When viewing **virtual UI** (READ_CUTOVER OFF):

| Pattern | Anchovas | Pepino |
|---------|----------|--------|
| **Re-read A** | unmatched (OCR miss) | matched (virtual `exact` → `confirmed`) |
| **Re-read B/C** | matched (OCR hit or alias added) | unmatched (persisted tombstone + reject pair, or reassigned) |

---

## Aliases Used

### Anchovas (Aviludo)

10 confirmed aliases for Anchoas ingredient (`c811f67f…`). Coverage depends on exact OCR spelling. See `.tmp/anchoas-reread-investigation/ALIAS_AUDIT.md` for full key list.

Key alias keys that hit/miss:

| OCR variant | Alias hit? |
|-------------|------------|
| `Alconfrisa` | ✅ HIT |
| `Alconfi sta` | ❌ MISS (until manual alias added post re-read #2) |
| `Alconfirsta` | ❌ MISS |

### Pepino (Bidfood)

No Bidfood alias for bare `"Pepino"`. Match path is bare **`exact`** name match → Pepino conserva.

---

## displayState Resolution

| Layer | Anchovas (alias miss) | Anchovas (alias hit) | Pepino (exact) |
|-------|----------------------|---------------------|----------------|
| Virtual | `unmatched` | `confirmed` | **`confirmed`** |
| Persisted (shadow seed) | `unmatched` | `confirmed` | **`suggested`** |

The Pepino virtual/persisted split is documented in `.tmp/match-lifecycle-phase4a-validation/PEPINO_DIFF.md`.

---

## Key Finding

**Items are recreated differently every time** — new UUIDs, different OCR strings (Anchovas), same OCR strings (Pepino). Matching is a function of:

1. OCR variant (Anchovas — primary driver)
2. Alias map at seed time (evolves with user confirms)
3. Display layer choice (virtual vs persisted — Pepino)

**Not** a function of prior `invoice_item_id` — those are always destroyed and replaced.
