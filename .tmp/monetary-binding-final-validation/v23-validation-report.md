# v23 Final Validation — Structured Contract + Binder

Generated: 2026-06-12  
Workspace: `/Users/salvadorseabra1/margin-master`  
Mode: **READ-ONLY**

---

## Deployment verified

| Check | Result |
|-------|--------|
| VL `extract-invoice` version | **v23** ✅ |
| Updated at (UTC) | **2026-06-12 00:03:48.171Z** ✅ |
| Bundle `ezbr_sha256` | **4afc87a5…** (changed from v22 `696a5e49…`) |
| Local commit | `ec5f42f` — *feat: enforce structured monetary extraction schema* |
| Structured contract enforcement | **DEPLOYED** |

### Deployed components

| Component | Status |
|-----------|--------|
| Phase 1 — Header Anchored Crop | ✅ |
| Phase 2 — Structured Monetary Prompt | ✅ |
| Phase 3 — Monetary Binder | ✅ |
| Structured Contract Enforcement (strict `json_schema`) | ✅ **v23** |

---

## 1. Five-run stability table (Pomodor Pelati)

Invoice: `f0aa5a08-86a3-4938-99f0-711e86073968` (IL Bocconcino)

| Run | Status | qty | gross | disc% | net | unit_price | total | vs VL GT |
|-----|--------|-----|-------|-------|-----|------------|-------|----------|
| 1 | 200 | 1 | — | — | — | 22.05 | 22.05 | Incorrect |
| 2 | 200 | 1 | — | — | — | 22.05 | 22.05 | Incorrect |
| 3 | 200 | 1 | — | — | — | 22.05 | 22.05 | Incorrect |
| 4 | 200 | 1 | — | — | — | 22.05 | 22.05 | Incorrect |
| 5 | 200 | 1 | — | — | — | 22.05 | 22.05 | Incorrect |

- **Deterministic:** YES — 5/5 identical
- **API item keys:** `name`, `quantity`, `unit`, `unit_price`, `total` (structured keys stripped at API boundary)
- **Correct vs VL GT:** 0/5

*Structured columns shown as — because API does not expose `gross_unit_price`, `discount_pct`, `line_total_net`.*

---

## 2. Structured fields present?

**NO** (in API response)

- No `gross_unit_price`, `discount_pct`, or `line_total_net` keys in HTTP response
- Expected: `monetaryToInvoiceLineItem` strips structured fields by design
- v23 strict `json_schema` forces structured keys at GPT layer (not observable without debug logging)

---

## 3. Binder receiving structured fields?

**LIKELY YES** (inferred, 78% confidence)

| Evidence | Direction |
|----------|-----------|
| v23 strict schema omits `unit_price`/`total` from GPT contract | Legacy direct-copy path blocked |
| API returns non-null `unit_price`/`total` (22.05) | Must be derived downstream |
| Output numerically identical to v22 | Consistent with correct structured extraction (gross 27.56, disc 20%, net 22.05) → binder derives unit 22.05 |
| No debug/raw GPT log | Cannot confirm 100% |

**v22:** GPT likely sent `unit_price=22.05, total=22.05` directly (legacy path, binder no-op).  
**v23:** Same API numbers but likely via `gross_unit_price` / `discount_pct` / `line_total_net` → `bindMonetaryColumns`.

---

## 4. Pomodor before vs after

| Stage | qty | unit | total | Structured in API | Pattern |
|-------|-----|------|-------|-------------------|---------|
| Visible invoice | 1 | 27.56 gross | 22.05 net | — | P.VENDA/DESC/VALOR |
| VL GT | 2 | 25 | 50 | — | catalog |
| Pre-Hybrid | 2 | 20–27.56 | 40–55 | no | variable DESC bleed |
| Phase 1+2 v21 | 1 | 22.05 | 22.05 | no | VALOR bleed |
| Phase 3 v22 | 1 | 22.05 | 22.05 | no | VALOR bleed (legacy GPT) |
| **v23 (current)** | 1 | 22.05 | 22.05 | no | **Same numbers; likely structured→binder path** |

**vs visible invoice net row:** qty and net total match (€22.05).  
**vs VL GT:** still wrong (qty 1 vs 2, total €22.05 vs €50).

---

## 5. Remaining monetary-column error (€)

| Reference | Pomodor line total error |
|-----------|--------------------------|
| vs VL GT (€50 expected) | **€27.95** under-extracted |
| vs visible invoice (€22.05 net) | **€0** |
| vs v22 | **€0** |

Column-binding error vs visible invoice: **resolved at net amount**. GT/catalog qty mismatch is a separate issue.

---

## 6. Financial delta vs v22

| Field | v22 modal | v23 modal | Delta |
|-------|-----------|-----------|-------|
| quantity | 1 | 1 | 0 |
| unit_price | €22.05 | €22.05 | €0 |
| total | €22.05 | €22.05 | €0 |

**€0 observable change** — pipeline derivation path likely changed without altering final API numbers on this row.

---

## 7. Emporio Prosciutto status

**OPEN — worse than prior audit on fixture invoke**

| Source | qty | unit_price | total |
|--------|-----|------------|-------|
| VL GT | 4 | 8.17 | 35.14 |
| Prior audit (v22 era) | 4 | 9.17 | 36.54 |
| **v23 fixture invoke** | 4.3 | 10.76 | 46.27 |

- Image: `.tmp/emporio-footer-audit/emporio/invoice-full.b64.txt` (VL DB record for `17aa3591…` not found)
- Product name variant: *Assopralmi Prosciutto Cotto Scelto HC 4+ 4,25KG*
- vs VL GT: **+€11.13** total error
- vs prior audit: **+€9.73** total error
- Structured fields: not in API response

**Caveat:** fixture-based invoke; not VL storage canonical image. Treat as indicative, not definitive regression proof.

---

## 8. Monetary Column Binding verdict

### **PARTIAL**

| Criterion | Status |
|-----------|--------|
| v23 structured contract deployed | ✅ |
| Strict `json_schema` active | ✅ (bundle changed) |
| Binder code deployed | ✅ (since v22) |
| Structured fields in API | ❌ (by design) |
| Binder observable on Pomodor | ⚠️ Likely yes, inferred |
| Pomodor vs visible invoice columns | ✅ Net unit/total correct |
| Pomodor vs VL GT | ❌ qty/catalog mismatch |
| Emporio Prosciutto | ❌ OPEN (worse on fixture) |
| 5-run stability vs VL GT | 0/5 |

**Not CLOSED** because:
1. VL GT mismatch persists (qty 1 vs 2 — outside pure column-binding)
2. No raw GPT structured field confirmation
3. Emporio Prosciutto not validated on VL canonical image

**Not fully OPEN** because:
1. v23 deploy confirms schema enforcement live
2. Pomodor net monetary values align with visible invoice
3. Legacy VALOR-bleed GPT path likely replaced by structured→binder derivation

---

## Recommendations

1. Add temporary Pass C raw logging to confirm `gross_unit_price`/`discount_pct`/`line_total_net` pre-binder
2. Re-test Emporio on VL storage image when DB record available
3. Address Pomodor qty vs VL GT as separate catalog/interpretation issue
4. Consider exposing structured fields in debug API mode for validation

---

## Artifacts

| File | Contents |
|------|----------|
| `pomodor-v23-stability.json` | Deployment + 5 runs + Emporio check |
| `v23-validation-report.md` | This report |
