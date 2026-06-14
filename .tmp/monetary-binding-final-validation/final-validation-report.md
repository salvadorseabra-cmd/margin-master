# Final Validation — Structured Contract + Binder

Generated: 2026-06-12  
Workspace: `/Users/salvadorseabra1/margin-master`  
Mode: **READ-ONLY**

---

## Deployment verdict

| Check | Expected | Actual |
|-------|----------|--------|
| VL `extract-invoice` version | **v23+** | **v22** |
| Updated at (UTC) | post schema commit | **2026-06-11 23:35:30** (unchanged) |
| Bundle `ezbr_sha256` | new hash | **696a5e49…** (same as v22 audit) |
| Structured contract enforcement | deployed | **NOT DEPLOYED** |
| Local schema changes | committed + deployed | **Uncommitted** in working tree |

**Schema enforcement (`TABLE_EXTRACTION_RESPONSE_FORMAT` / strict `json_schema`) exists locally only** — not committed, not on VL edge.

### Deployed components

| Component | Status |
|-----------|--------|
| Phase 1 — Header Anchored Crop | ✅ v21+ |
| Phase 2 — Structured Monetary Prompt | ✅ v21+ (prompt only) |
| Phase 3 — Monetary Binder | ✅ v22 (`de556e0`) |
| Structured Contract Enforcement | ❌ **Missing** (needs v23 deploy) |

---

## 1. Five-run stability table (Pomodor Pelati)

Invoice: `f0aa5a08-86a3-4938-99f0-711e86073968` (IL Bocconcino)  
Deployed: **v22** (not post-schema)

| Run | Status | qty | gross | disc% | net | unit_price | total | vs VL GT |
|-----|--------|-----|-------|-------|-----|------------|-------|----------|
| 1 | 200 | 1 | null | null | null | 22.05 | 22.05 | Incorrect |
| 2 | 200 | 1 | null | null | null | 22.05 | 22.05 | Incorrect |
| 3 | 200 | 1 | null | null | null | 22.05 | 22.05 | Incorrect |
| 4 | 200 | 1 | null | null | null | 22.05 | 22.05 | Incorrect |
| 5 | 200 | 1 | null | null | null | 22.05 | 22.05 | Incorrect |

- **Deterministic:** YES — 5/5 identical
- **Item keys:** `name`, `quantity`, `unit`, `unit_price`, `total` (legacy only)
- **Avg invoke:** ~14s

---

## 2. Structured fields present?

**NO**

- API response has no `gross_unit_price`, `discount_pct`, or `line_total_net` keys
- Deployed Pass C still uses `json_object` only (no strict schema)
- Pattern matches v22 legacy-only GPT output (`.tmp/structured-monetary-trace/` scenario B)

*Note: API strips structured fields by design (`monetaryToInvoiceLineItem`). Even after schema deploy, API would still show legacy keys only — binder effect must be inferred from output behavior.*

---

## 3. Binder received structured fields?

**NO** (inferred)

Evidence:
- Output **identical** to v22 / Phase 1+2 modal: qty=1, unit=€22.05, total=€22.05
- Pattern = **VALOR copied to both unit_price and total** (legacy GPT path)
- If binder ran on structured input (gross 27.56, disc 20%, net 22.05), API output would be same numbers but via derivation — indistinguishable on this row alone
- However: deployed code lacks `json_schema` enforcement, so GPT almost certainly still returns legacy-only JSON → binder `applyStructuredBinding` no-op

**Confidence binder did not run:** 90%

---

## 4. Pomodor before vs after

| Stage | qty | unit | total | Structured | Pattern |
|-------|-----|------|-------|------------|---------|
| Visible invoice | 1 | 27.56 gross | 22.05 net | yes | P.VENDA/DESC/VALOR |
| VL GT | 2 | 25 | 50 | — | catalog |
| Pre-Hybrid | 2 | 20–27.56 | 40–55 | no | variable DESC bleed |
| Phase 1+2 v21 | 1 | 22.05 | 22.05 | no | VALOR bleed |
| Phase 3 v22 | 1 | 22.05 | 22.05 | no | VALOR bleed |
| **Post-schema (this audit)** | 1 | 22.05 | 22.05 | no | **Same as v22** |

**No change** — schema enforcement not deployed.

---

## 5. Remaining monetary-column errors (€)

| Reference | Pomodor line total error |
|-----------|--------------------------|
| vs VL GT (€50 expected) | **€27.95** under-extracted |
| vs visible invoice (€22.05 net) | **€0** (matches net row) |
| vs v22 | **€0** (no delta) |

---

## 6. Remaining column-shift rows

| Invoice | Product | Status | Pattern | € impact vs VL GT |
|---------|---------|--------|---------|-------------------|
| IL Bocconcino | POMODOR PELATI | **OPEN** | VALOR_net_as_unit_and_total_qty1 | €27.95 |
| Emporio Italia | Prosciutto Cotto | NOT_RETESTED | prior ~€1.40 residual | ~€1.40 |

---

## 7. Financial accuracy delta vs v22

| Field | v22 modal | Current (v22 redeployed) | Delta |
|-------|-----------|--------------------------|-------|
| quantity | 1 | 1 | 0 |
| unit_price | €22.05 | €22.05 | €0 |
| total | €22.05 | €22.05 | €0 |

**€0 change** — validation run confirms v22 behavior, not post-schema behavior.

---

## 8. Monetary Column Binding verdict

### **OPEN**

| Criterion | Status |
|-----------|--------|
| Phase 3 binder code deployed | ✅ v22 |
| Structured GPT output | ❌ legacy-only |
| Schema enforcement deployed | ❌ local only |
| Binder observable effect | ❌ no-op |
| 5-run stability vs VL GT | 0/5 |
| Family closed | **NO** |

**Cannot be CLOSED** until:
1. Commit + deploy schema enforcement (`supabase functions deploy extract-invoice`)
2. Confirm v23+ with new bundle hash
3. Re-run 5-run Pomodor stability
4. Verify GPT emits structured fields (via debug logging or inferred binder behavior)

**PARTIAL** would apply if: schema deployed + structured fields flow + binder derives unit, but qty/GT mismatch remains.

---

## Root cause chain (confirmed)

```
v22 deployed (Phase 3 binder active)
  → Pass C uses json_object only (no strict schema)
  → GPT returns legacy unit_price/total
  → parseMonetaryLineItems sets structured = null
  → bindMonetaryColumns no-op
  → API: qty=1, €22.05/€22.05

Schema enforcement implemented locally (uncommitted)
  → NOT on VL edge
  → This validation tests v22 again, not the fix
```

Prior investigations:
- `.tmp/structured-extraction-failure/` — root cause B+D (unenforced schema)
- `.tmp/structured-monetary-trace/` — downstream pipeline works when structured present
- `.tmp/monetary-binding-final-validation/pomodor-5run-v22-stability.json` — identical baseline

---

## Next action

1. **Commit** schema enforcement changes (`invoice-date-extraction.ts`, `invoice-table-extraction.ts`)
2. **Deploy** to VL: `supabase functions deploy extract-invoice --project-ref bjhnlrgodcqoyzddbpbd`
3. **Verify** v23+ and new `ezbr_sha256`
4. **Re-run** this 5-run validation
5. Optionally add Pass C raw logging to confirm structured fields pre-binder

---

## Artifacts

| File | Contents |
|------|----------|
| `post-schema-enforcement-validation.json` | Deployment state + 5 runs |
| `final-validation-report.md` | This report |
