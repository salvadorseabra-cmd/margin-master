# Race Condition Audit — Re-Read Determinism Investigation

**Generated:** 2026-06-14  
**Mode:** READ-ONLY investigation  
**Related audits:** `.tmp/match-lifecycle-phase3-validation/DUAL_WRITE_FLOW.md`, `.tmp/match-lifecycle-phase4b-validation/FALLBACK_ANALYSIS.md`

---

## Verdict

**Extract/re-read path is sequential and race-free.** No evidence that shadow seed, dual write, or read cutover timing causes the Anchovas/Pepino flip.

Root cause classification **D (Race condition): ❌ Does not apply.**

---

## Operation Audit

| Operation | Async? | Blocks extract? | Race risk |
|-----------|--------|-----------------|-----------|
| `DELETE` + `INSERT` items | awaited | yes | None |
| Cost sync | awaited | yes | None |
| Shadow seed | **awaited** | yes | None on extract |
| Dual write on user action | **`void`** (fire-and-forget) | n/a | Brief UI/DB drift on confirm only |
| `loadItems` after reExtract | awaited | yes | Display layer choice, not timing race |
| `extractionInFlightRef` mutex | yes | prevents double extract | None |

---

## Extract Path — Sequential Proof

From `src/routes/invoices.tsx` `runExtraction` (~1344–1583):

```
await extract-invoice        // step 1
await DELETE invoice_items     // step 3
await INSERT invoice_items     // step 4
await cost sync                // step 5
await shadowSeed...            // step 7  ← awaited, not fire-and-forget
return                         // step 8
```

Then in `reExtract`:

```
await runExtraction(...)
await loadItems(invoiceId)     // reload UI
await load()                   // reload list
```

Every DB mutation on the extract path is **awaited** before the next step. Shadow seed completes before extraction returns.

---

## Shadow Seed

**File:** `src/lib/invoice-item-match-shadow-seed.ts`

- Called with `await` in `runExtraction`
- Upserts match rows synchronously within extraction transaction flow
- Cannot race with subsequent `loadItems` because extraction must complete first

**Risk assessed:** None on re-read path.

---

## Dual Write

**File:** dual write helpers

- Invoked via `void dualWriteMatchLifecycleAfterIngredientPersist(...)` on user confirm/correct/reassign
- **Not invoked during extract/re-read**
- Fire-and-forget nature means confirm action may briefly show stale UI before DB catches up

**Risk assessed:** Irrelevant to re-read flip. Only affects user-initiated match changes.

---

## Read Cutover Timing

With `READ_CUTOVER=false`:

- `loadItems` does not populate `persistedMatchByItemId`
- UI always uses virtual matcher output
- This is a **configuration choice**, not a race — persisted rows may exist but are intentionally not read

With `READ_CUTOVER=true`:

- `loadItems` fetches persisted matches before rendering
- Still sequential — fetch completes before render

**Risk assessed:** Display layer divergence (E), not timing race (D).

---

## Extraction Mutex

`extractionInFlightRef` prevents concurrent extract on the same invoice:

- Second re-read click while first is in-flight is blocked
- No interleaved DELETE/INSERT from parallel extracts

**Risk assessed:** None.

---

## Reject Pairs (localStorage)

Reject pairs are hydrated synchronously during `loadItems` / row resolution:

- Keyed by supplier + normalized line text, not item UUID
- Survive item UUID rotation on re-read
- Can block virtual match even when matcher would hit

This is **stateful client-side filtering**, not an async race. See `.tmp/pepino-live-validation/UNMATCH_VALIDATION.md`.

---

## Hypothetical Race Scenarios (Ruled Out)

| Scenario | Ruled out because |
|----------|-------------------|
| Shadow seed incomplete when UI loads | Shadow seed is awaited before `runExtraction` returns; `loadItems` runs after |
| Dual write overwrites seed result during extract | Dual write not called on extract path |
| Two re-reads interleave DELETE/INSERT | `extractionInFlightRef` mutex |
| Persisted map stale vs virtual re-run | Not a race — READ_CUTOVER OFF intentionally skips persisted map |
| OCR response arrives out of order | Single awaited call; mutex prevents parallel |

---

## Conclusion

The Anchovas/Pepino flip across re-reads is explained by:

1. **OCR variability** (different input each re-read)
2. **CASCADE lifecycle reset** (no preserve policy)
3. **Virtual vs persisted display split** (READ_CUTOVER OFF)

Not by async timing, fire-and-forget seed, or extract-path races.
