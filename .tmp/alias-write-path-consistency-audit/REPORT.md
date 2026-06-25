# Alias Write-Path Consistency Audit

**VL:** `bjhnlrgodcqoyzddbpbd` · **Mode:** STRICT READ-ONLY

## Verdict: **E) Combination (C + D)**

Write and read are **symmetric** — both use `buildOverrideKeysFromInvoiceLine`; neither strips brand prefixes. Prosciutto miss is **structural gap + historical data** (alias stored without `Rovagnati -` before re-read added prefix).

**Not A (write-only) or B (read-only).** **Confidence: 91%**

---

## Write path (Confirm Match → DB)

```
persistIngredientCorrectionForItem
 → buildManualIngredientCorrectionKeys (raw item.name.trim())
 → buildOverrideKeysFromInvoiceLine → normalizeOperationalAliasKey
 → upsertConfirmedAlias → ingredient_aliases
```

`alias_name` = raw invoice line (no brand strip).

---

## Read path

Same `buildOverrideKeysFromInvoiceLine` on invoice `item.name` → override lookup → alias map → semantic fallback.

---

## Write vs read

| Transform | Write | Read | Display |
|-----------|-------|------|---------|
| Brand prefix strip | No | No | **Yes** |
| Supplier shorthand | Yes | Yes | Partial |
| Shared key builder | **Same function** | **Same function** | N/A |

---

## Historical replay

| Product | Prefix at confirm | Lookup today |
|---------|-------------------|--------------|
| **Prosciutto** | **No** | **MISS** |
| Mortadella | Yes | HIT |
| Gorgonzola | Yes | HIT |
| Bresaola | Yes | HIT |
| Paccheri | Yes | HIT |

---

## Confirm Prosciutto today

Would store **`Rovagnati - Assaporami...`** (raw line). Self-heals current spelling; still fragile if OCR drops prefix again.

---

## Final answers

1. Keys created at `buildOverrideKeysFromInvoiceLine` in confirm/save paths
2. Write/read identical? **Yes**
3. Confirm today → future regression? **Partially fragile**
4. DB consistent? **Per-row yes; corpus mixed prefixes**
5. One normalization enough? **Almost — add brand strip to shared spine**
6. Classification: **E**
7. Confidence: **91%**

---

## Investigation chain

[Possible match regression](2a540841-f4c4-425f-b75d-ed064ea17896) → [brand prefix coverage](c696d58f-3a69-4bf2-887b-bf1aff69c11d) → this audit closes the write/read question: **fix belongs on shared alias spine, not read-only**.
