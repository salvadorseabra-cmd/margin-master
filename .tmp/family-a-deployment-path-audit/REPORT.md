# Family A Deployment Path Audit

**Generated:** 2026-06-23  
**Mode:** STRICT READ-ONLY  
**Validation Lab:** `bjhnlrgodcqoyzddbpbd`

---

## Executive Answers

| Question | Answer |
|----------|--------|
| **Does Re-read invoke `extract-invoice`?** | **Yes.** Both Re-read and initial upload call `runExtraction()` → `supabase.functions.invoke("extract-invoice", { body: { imageDataUrl } })`. |
| **Does it use `invoice-table-extraction.ts` / Hybrid H pass?** | **Yes.** Edge function Pass D (`stage=2d table-pass`) calls `extractTableItemsFromImage` → `runTableExtractionPass` → `callOpenAiJson` with `TABLE_EXTRACTION_SYSTEM_PROMPT`. |
| **Is Re-read the same path as initial upload?** | **Yes.** Same `runExtraction` helper; only file acquisition differs (storage signed URL vs local `File`). |
| **Are local Family A prompt changes deployed to VL?** | **No.** Family A commit `03ae903` (2026-06-23) is **after** VL deploy **v36** (2026-06-20). v36 maps to `853e02c`; Family A guardrails are absent from that bundle. |
| **What must happen for Re-read to use new code?** | **Deploy** `extract-invoice` to the Supabase project the UI actually calls, then Re-read (no UI change needed). |

---

## 1. Re-read Button → API

### UI locations (`src/routes/invoices.tsx`)

| Control | Line | Handler |
|---------|------|---------|
| Expanded panel **"Re-read"** button | ~3483 | `onExtract` prop → `() => reExtract(r)` |
| List row wand icon (title "Re-read invoice") | ~2761 | `onClick={() => reExtract(r)}` |

Both are gated by `isExtractableInvoicePath(r.file_path)` (PDF/image extensions).

### `reExtract()` flow (line 2393)

1. Guard: `row.file_path` present and extractable extension.
2. `supabase.storage.from("invoices").createSignedUrl(row.file_path, 120)`.
3. Fetch blob from signed URL.
4. `fileToExtractionDataUrl(blob, filename)` — **PDF rasterized client-side** to PNG data URL.
5. `runExtraction(row.id, dataUrl)` — **same function as upload**.

### Initial upload (`uploadOne`, line 1584)

After storage upload + `invoices` row insert:

```typescript
const dataUrl = await fileToExtractionDataUrl(item.file);
const ext = await runExtraction(inserted.id, dataUrl);
```

**Conclusion:** Re-read and upload share one extraction+persistence pipeline.

---

## 2. Client → Edge Function → Hybrid H

### `runExtraction()` (line 1339)

```typescript
const { data, error } = await supabase.functions.invoke("extract-invoice", {
  body: { imageDataUrl: dataUrl },
});
```

- Logs: `[invoice-ocr] stage=3 provider-request { function: "extract-invoice" }`.
- On success: normalizes items, **deletes** existing `invoice_items`, **inserts** new rows (client-side, line 1430–1461).
- Edge function returns JSON only; **does not write DB**.

### `extract-invoice/index.ts` — four-pass vision pipeline

| Pass | Module | Purpose |
|------|--------|---------|
| A | `invoice-date-extraction.ts` | Issue date |
| B | `invoice-metadata-extraction.ts` | Supplier |
| C | `invoice-footer-metadata-extraction.ts` | Footer totals |
| **D (Hybrid H)** | **`invoice-table-extraction.ts`** | **Line items / quantities** |

Pass D call (index.ts line 148):

```typescript
tableFromPass = await extractTableItemsFromImage(imageDataUrl, OPENAI_API_KEY, footerFromPass.total);
```

### Hybrid H internals (`invoice-table-extraction.ts`)

`extractTableItemsFromImage` → `runTableExtractionPass` (line 360):

1. `cropTableRegionForLineItems` (table crop).
2. `callOpenAiJson` with **`TABLE_EXTRACTION_SYSTEM_PROMPT`** (line 400) + `TABLE_EXTRACTION_RESPONSE_FORMAT`.
3. `parseMonetaryLineItems` → `bindMonetaryColumns` → `reconcileLineItemAmounts`.
4. `finalizeExtractedLineItems` (net subtotal reconcile) in index.ts.

**Family A fix target:** `TABLE_EXTRACTION_SYSTEM_PROMPT` in this file.

---

## 3. Deployment State

### No automated deploy in repo

- `package.json` has **no** `deploy` or `supabase functions deploy` script.
- `supabase/config.toml` `project_id` = `lhackrnlnrsiamorzmkb` (production), not VL.
- Documented manual command (from prior audits):  
  `supabase functions deploy extract-invoice --project-ref bjhnlrgodcqoyzddbpbd`

### Live edge function versions (CLI audit 2026-06-23)

| Project | Ref | `extract-invoice` version | Last updated | Era |
|---------|-----|---------------------------|--------------|-----|
| **Validation Lab** | `bjhnlrgodcqoyzddbpbd` | **v36** | 2026-06-20T01:22:46Z | Hybrid H + effective-paid binding (`853e02c`) |
| **Production (default `.env`)** | `lhackrnlnrsiamorzmkb` | **v17** | 2026-05-18T22:20:50Z | Pre–Hybrid H |

v36 `updated_at` matches commit `853e02c` timestamp exactly (2026-06-20 02:22:46 +0100).

### Which project does the app call?

Workspace `.env`:

```
VITE_SUPABASE_URL="https://lhackrnlnrsiamorzmkb.supabase.co"
```

`src/integrations/supabase/client.ts` uses `import.meta.env.VITE_SUPABASE_URL`.

**Implication:** Default local/dev build hits **production v17**, not VL v36. VL testing requires `VITE_SUPABASE_URL` override to `https://bjhnlrgodcqoyzddbpbd.supabase.co` (e.g. `.env.local` per `supabase/README.md`).

### Local code is not live without deploy

Edge functions run on Supabase infrastructure. Uncommitted or committed-but-undeployed changes in `supabase/functions/` do **not** affect Re-read until `supabase functions deploy` succeeds on the target project.

---

## 4. Family A Prompt Changes — Local vs VL

### Local (committed `03ae903`, 2026-06-23)

Changes in `invoice-table-extraction.ts`:

1. **TOTAL COLUMN ISOLATION** softened — undiscounted qty=1 rows may have `line_total_net ≈ gross_unit_price`; do not infer qty>1.
2. **BOCCONCINO UNDISCOUNTED BLANK-DESC** guardrail added with MEZZI and RICOTTA negative examples (qty **1**, NOT 2/6).

`git diff 853e02c 03ae903` confirms only these prompt additions; no binding-layer changes.

### VL v36 (deployed 2026-06-20, commit `853e02c`)

- Has `TOTAL COLUMN ISOLATION` with the **old** rule: *"When quantity > 1, line_total_net should exceed gross_unit_price"*.
- **Lacks** `BOCCONCINO UNDISCOUNTED BLANK-DESC ROWS` section entirely (`git show 853e02c:... | rg BOCCONCINO` → no match).

### Behavioral evidence on v36

`.tmp/family-a-v25-raw-capture/edge-invoke-final.json` (captured 2026-06-20, deploy v36):

| Product | qty returned |
|---------|-------------|
| MEZZI PACCHERI MANCINI | **2** |
| RICOTTA TREVIGIANA 1,5KG | **2** |

This is pre-Family-A behavior. `.tmp/family-a-implementation/REPORT.md` lists post-deploy validation as **pending**.

---

## 5. Deploy History Artifacts

| Artifact | Content |
|----------|---------|
| `.tmp/family-a-v25-raw-capture/artifact-index.json` | Index of v25/v36 captures for invoice `f0aa5a08` |
| `.tmp/family-a-v25-raw-capture/edge-invoke-final.json` | v36 live invoke — Mezzi/Ricotta qty=2 |
| `.tmp/family-a-causal-attribution/attribution.json` | Deploy timeline v21–v36; Family A qty=2 first at v25 |
| `.tmp/family-a-implementation/REPORT.md` | Implementation complete; **deploy still required** |

No v37+ deploy found in CLI listing or artifacts.

---

## 6. What Must Happen for Re-read to Use Family A Code

1. **Deploy** to the project the UI targets:
   ```bash
   supabase functions deploy extract-invoice --project-ref bjhnlrgodcqoyzddbpbd
   ```
   (Use `lhackrnlnrsiamorzmkb` instead if testing against production URL.)

2. **Confirm** new version > v36 via `supabase functions list --project-ref bjhnlrgodcqoyzddbpbd`.

3. **Ensure** `VITE_SUPABASE_URL` matches the deployed project.

4. **Press Re-read** on target invoice — no separate re-read endpoint or code path exists.

5. **Validate** Bocconcino `f0aa5a08`: Mezzi/Ricotta qty=1; Pomodori/Rolo/Acqua unchanged (per implementation regression matrix).

---

## Path Diagram

```
[Re-read button] ──reExtract()──┐
                                 ├──► runExtraction(invoiceId, dataUrl)
[Upload file] ───uploadOne()────┘         │
                                          ▼
                          supabase.functions.invoke("extract-invoice")
                                          │
                          ┌───────────────┴───────────────┐
                          ▼                               │
                   extract-invoice/index.ts               │
                          │                               │
              Pass A/B/C (date, supplier, footer)         │
                          │                               │
                          ▼                               │
              invoice-table-extraction.ts  ◄── Hybrid H    │
              TABLE_EXTRACTION_SYSTEM_PROMPT              │
              callOpenAiJson → bind → reconcile           │
                          │                               │
                          ▼                               │
                   JSON { items, supplier, total }        │
                          │                               │
                          ▼                               │
              Client: DELETE + INSERT invoice_items       │
                          │                               │
                          ▼                               │
                   UI refreshes line items                │
```

---

## Evidence Sources

- `src/routes/invoices.tsx` — Re-read UI, `reExtract`, `runExtraction`, `uploadOne`
- `supabase/functions/extract-invoice/index.ts` — four-pass orchestration
- `supabase/functions/extract-invoice/invoice-table-extraction.ts` — Hybrid H + Family A prompt
- `src/integrations/supabase/client.ts` — Supabase URL resolution
- `.env` — default project ref
- `supabase/config.toml` — linked project_id
- `git log` / `git diff 853e02c 03ae903` — Family A commit vs v36 deploy
- `supabase functions list` — live v36 (VL), v17 (production)
- `.tmp/family-a-v25-raw-capture/edge-invoke-final.json` — v36 behavioral proof
- `.tmp/family-a-implementation/REPORT.md` — post-deploy checklist

Machine-readable path: `.tmp/family-a-deployment-path-audit/path.json`
