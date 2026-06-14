# Anchoas Alias Audit — Live Database

**Mode:** READ-ONLY investigation  
**Generated:** 2026-06-14  
**Queried live VL DB:** 2026-06-14T17:34Z  
**Scripts:** `scripts/validate-anchovas-persistence.mts`, `scripts/validate-anchoas-reread.mts`

---

## Ingredient

| Field | Value |
|-------|-------|
| ID | `c811f67f-df4d-4194-ba8b-7a15d4af38bd` |
| Name | Anchoas |
| Created | `2026-06-07T23:42:41.173Z` |
| Confirmed aliases | **10** |

---

## Co-Creation Evidence (Create Persisted Alias)

| Event | Timestamp | Delta |
|-------|-----------|-------|
| `ingredients` row created | `2026-06-07T23:42:41.173Z` | — |
| First alias row (Alfonsoita, Avijudo) | `2026-06-07T23:42:41.333Z` | **+160ms** |

First alias id: `94cd3a7c…` (approx — see live DB)

This proves Create Ingredient wrote an alias in the same session as ingredient creation.

---

## Original Create Line (NOT April AVILUDO)

| Field | Value |
|-------|-------|
| OCR text | `Filete de Anchoas Alfonsoita L4 495 g` |
| Supplier | **Avijudo** (May review) |
| Normalized key | `filete de anchoas alfonsoita 495` |
| Lookup key | `Avijudo::filete de anchoas alfonsoita 495` |
| Alias today? | **Yes** — co-created 2026-06-07 |

April AVILUDO invoice (`c2f52357-0f80-491a-ba14-c97ff4837472`) was **not** the line that created canonical Anchoas. First AVILUDO-related alias is **Alconfrisa** on 2026-06-08 — a later session after Anchoas already existed.

---

## Alias Rows (Representative Sample)

| created_at | supplier | alias_name | normalized_alias | origin |
|------------|----------|------------|------------------|--------|
| 2026-06-07 | Avijudo | Filete de Anchoas **Alfonsoita** L4 495 g | `filete de anchoas alfonsoita 495` | **Create Ingredient** |
| 2026-06-08 | **AVILUDO** | Filete de **Anchovas Alconfrisa** Lt 495 g | `filete de anchovas alconfrisa 495` | Manual match / create-reuse |
| 2026-06-14 | **AVILUDO** | Filete de Anchovas **Alconfi sta** Lt 495 g | `filete de anchovas alconfi sta 495` | Manual match |
| 2026-06-14 | **AVILUDO** | Filete de Anchovas **Alconfrista** Lt 495 g | `filete de anchovas alconfrista 495` | Manual match |
| +6 more | Avijudo/Aviludo | various brand-token variants | … | Mixed |

Full row list available via:

```bash
npx vite-node scripts/validate-create-ingredient-persistence.mts baseline
```

---

## April AVILUDO Invoice State (Post Re-read, ~17:15Z)

| Field | Value |
|-------|-------|
| Invoice ID | `c2f52357-0f80-491a-ba14-c97ff4837472` |
| Line OCR | `Filete de Anchovas Alconfrista Lt 495 g` |
| Match status | `confirmed` / `confirmed-override` → Anchoas |
| All 9 lines | Confirmed via override hydration |

---

## Matcher Simulation (Live Aliases, 17:35Z)

Supplier scope: **AVILUDO**

| OCR variant | Auto-match? | Alias source |
|-------------|-------------|--------------|
| `…Alconfrisa Lt…` | ✅ | Create-era alias (2026-06-08) |
| `…Alconfrista Lt…` | ✅ | Manual match (2026-06-14) |
| `…Alconfi sta Lt…` | ✅ | Manual match (2026-06-14) |
| `…Alconfirosa LI…` (OCR hardening stable) | ❌ **no alias row** | — |
| `…Alconfirsta L1…` | ❌ | — |

Manual match on **Alconfrista** works on next re-read **when OCR returns that exact spelling**. Each new OCR variant requires a separate alias row (whack-a-mole: 10 aliases accumulated).

---

## invoice_item_matches (Anchoas)

Multiple confirmed matches across invoices. April AVILUDO line has persisted MLS row after manual confirms. Prior investigations note April had "ghost" price history without confirmed line match before early re-reads — resolved after manual alias accumulation.

Query:

```bash
npx vite-node scripts/validate-anchovas-persistence.mts baseline
```

---

## Override-Related Records

Alias rows hydrate into in-memory override map at page load (`hydrateIngredientMatchOverridesFromAliasRows`). On re-read, matcher step 1 consults override first → live Anchovas rows show `match_kind: confirmed-override` when alias key hits.

Functionally equivalent for recall — same keys as `ingredient_aliases`.

---

## Key Audit Conclusions

1. **Create DID persist alias** — co-creation timestamp proves it.
2. **Original create line HAS alias today** — Alfonsoita / Avijudo key exists.
3. **April re-read failure is NOT missing create alias** — different supplier + different OCR text; April keys were added by later manual matches.
4. **10 aliases** — evidence of OCR variant churn, not missing persist logic.
