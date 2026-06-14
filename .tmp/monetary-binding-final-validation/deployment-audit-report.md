# Deployment Audit — Why Phase 3 (`de556e0`) Is Not on VL Edge

Generated: 2026-06-12  
Workspace: `/Users/salvadorseabra1/margin-master`  
Mode: **READ-ONLY**

---

## Summary

| | Deployed (VL) | Local |
|--|---------------|-------|
| **Version** | **v21** | commit **`de556e0`** |
| **Timestamp** | 2026-06-11 23:19:43 UTC | 2026-06-12 00:28:06 +0100 |
| **Commit** | **`65452a9`** (Phase 1+2) | **`de556e0`** (Phase 3) |
| **Phase** | Hybrid H Phase 1+2 | Hybrid H Phase 1+2 **+ Phase 3** |

**Exact reason:** Phase 3 was **committed** but **`supabase functions deploy` was never run** after `de556e0`. VL froze at the Phase 1+2 deploy (v21).

---

## 1. Was `supabase functions deploy` executed?

| Deploy | Executed? | Evidence |
|--------|-----------|----------|
| Phase 1+2 (`65452a9` → v21) | **YES** | v21 `updated_at` = 00:19:43 +0100, 13s after `65452a9` commit |
| Phase 3 (`de556e0` → v22+) | **NO** | No deploy logs in `.tmp/`, terminals, or agent transcripts after `de556e0` |

---

## 2. Did deploy succeed?

| Deploy | Result |
|--------|--------|
| Phase 1+2 | **Succeeded** — v20 → v21, Pomodor 5-run shows Phase 1+2 behavior |
| Phase 3 | **Not attempted** — no failure; simply never run |

---

## 3. Which commit/hash is deployed?

- **Inferred deployed commit:** `65452a9` — *feat: hybrid h phase 1 and phase 2*
- **VL version:** 21
- **ezbr_sha256:** `0f65cdbe9dada0c8cf6bb05d857d885f600daf01e825f5f5d70a99c74219e4ff`
- **Proof:** `git show 65452a9:invoice-monetary-binding.ts` → **file does not exist**

Supabase does not expose git commit hash on edge functions; commit inferred from version timestamp + file presence.

---

## 4. Is `invoice-monetary-binding.ts` in the deployed bundle?

**NO.**

| File | At `65452a9` (deployed) | At `de556e0` (local HEAD) |
|------|-------------------------|---------------------------|
| `invoice-monetary-binding.ts` | Missing | Present (203 lines) |
| `invoice-monetary-binding.test.ts` | Missing | Present (not edge-bundled) |
| `invoice-table-extraction.ts` binder wiring | Missing | Present |

`de556e0` diff on `supabase/functions/extract-invoice/`:
- **+341 lines** (binder + tests + table-extraction wiring)
- **−51 lines** (removed inline `normalizeItems` from table-extraction)

---

## 5. Is the pipeline executing binder logic?

### Locally (HEAD `de556e0`): **YES**

```
index.ts
  └─ extractTableItemsFromImage()  [invoice-table-extraction.ts]
       ├─ Pass C GPT
       ├─ parseMonetaryLineItems()
       ├─ bindMonetaryColumns()      ← Phase 3
       ├─ monetaryToInvoiceLineItem()
       └─ reconcileLineItemAmounts()
```

`index.ts` does **not** import the binder directly — wiring is inside `invoice-table-extraction.ts` (by design).

### On VL edge (v21 / `65452a9`): **NO**

Deployed `invoice-table-extraction.ts` uses legacy `normalizeItems()` only — no `bindMonetaryColumns` import.

---

## 6. Deployment cache / version mismatch?

**No cache mismatch detected.**

- Linked project: `bjhnlrgodcqoyzddbpbd` (`supabase/.temp/project-ref`) ✓
- `config.toml` `project_id` = `lhackrnlnrsiamorzmkb` (different project) — prior deploys correctly used `--project-ref bjhnlrgodcqoyzddbpbd`
- Version stuck at 21 because **no second deploy**, not stale cache

---

## Timeline

```
00:19:30  65452a9 committed (Phase 1+2)
00:19:43  VL v21 deployed          ← last successful deploy
00:28:06  de556e0 committed (Phase 3)
          (no deploy)               ← gap: Phase 3 never pushed to edge
```

---

## Invoke behavior confirms v21

Phase 3 validation 5-run (`pomodor-5run-phase3-stability.json`):
- **Identical** to Phase 1+2 v21 baseline (qty 1, €22.05/€22.05)
- Structured fields absent
- 0/5 vs VL GT

If Phase 3 were active with structured GPT output, Rule B/E corrections would differ from v21 on DESC/neighbour bleed cases.

---

## Commands to deploy Phase 3 correctly

```bash
cd /Users/salvadorseabra1/margin-master

# Optional pre-deploy tests
.tmp/deno/bin/deno test --allow-read=. --allow-net \
  supabase/functions/extract-invoice/invoice-monetary-binding.test.ts \
  supabase/functions/extract-invoice/invoice-image-crop.test.ts

# Deploy to Validation Lab (must use --project-ref)
supabase functions deploy extract-invoice --project-ref bjhnlrgodcqoyzddbpbd

# Verify version bumped
supabase functions list --project-ref bjhnlrgodcqoyzddbpbd
# Expect: extract-invoice v22+ with updated_at > 2026-06-11T23:19:43Z

# Re-run 5-invoke Bocconcino Pomodor stability
```

---

## Artifacts

- `deployment-audit.json` — machine-readable audit
- `deployment-audit-report.md` — this report
- `pomodor-5run-phase3-stability.json` — invoke evidence (unchanged vs v21)
