# Edge Case Audit — VL Purchase Unit Tokens

**Mode:** Read-only · **VL:** `bjhnlrgodcqoyzddbpbd` · **Queried:** 2026-06-15 (live)  
**Tokens:** dúzia, dz, saco, balde, lata, frasco, garrafa, embalagem — supported? risk?

---

## Token scan

| Token | VL example | Supported? | Risk |
|---|---|---|---|
| **dúzia** | Bidfood eggs `Cx.15 dúzias` | ✅ Parsed as 1 cx @ case price | Low — no inner count extracted |
| **dz** | — | Not seen on VL | Unknown |
| **saco** | Atum "Bolsa" (bag) | ✅ Weight in name (1kg) | Low on confirmed |
| **balde** | — | Not seen | — |
| **lata** | Anchovas "Lt" in name | ✅ 495g can weight | Low |
| **frasco** | Pepinos `Frasco 6×720g` | ✅ Multipack | Low |
| **garrafa** | — | Not seen | Container token supported in code |
| **embalagem / emb** | Bidfood `EMB 1 Kg`, `EMB. 250g` | ✅ Weight row | Low |
| **mo** (bunch) | Tomilho, Manjericão | ⚠️ Partial | Manjericão pq=100 (g path) — review if matched |
| **0.20cl** | Emporio Ginger Beer | ❌ Known parse bug | **HIGH** if confirmed without re-extract |
| **g/ml as row unit** | Emporio 8 lines | ⚠️ OCR artifact | **HIGH** — qty is count, unit is wrong |

---

## Emporio live — OCR `g`/`ml` risk (HIGH)

All 8 Emporio lines have `g` or `ml` as row unit where qty appears to be a **count**, not a weight/volume measure. This is a classic OCR qty/unit swap.

| Product | Qty | Unit | Pipeline | Risk |
|---|---:|---|---|---|
| Arrigoni Gorgonzola DOP Dolce… | 2 | **g** | WEIGHTED | HIGH — likely 2 pieces |
| Baladin Ginger Beer 0.20cl | 24 | **ml** | WEIGHTED | HIGH — `0.20cl` parse bug + wrong unit |
| De Cecco Paccheri 500g | 24 | **g** | WEIGHTED | HIGH — likely 24 packs |
| Rigamonti Bresaola 1/2… | 1.83 | **g** | WEIGHTED | HIGH — likely kg weight |
| Rovagnati Prosciutto Cotto… | 4.3 | **g** | WEIGHTED | HIGH — likely kg weight |
| Rovagnati Mortadella IGP… | 3.11 | **g** | WEIGHTED | HIGH — likely kg weight |
| Rovagnati Salame Ventricina 2,5 Kg | 2.6 | **g** | WEIGHTED | HIGH — likely kg weight |
| SanPellegrino Acqua 75cl x 15ud | 2 | **ml** | WEIGHTED | HIGH — likely 2 cases |

**Recommendation:** Do not bulk-confirm Emporio without re-extract or manual line-level review. Ginger Beer `0.20cl` is a known volume parse failure (→ 2ml usable instead of 200ml).

---

## Bocconcino — unmatched volume/case lines

| Product | Qty | Unit | Classification | Notes |
|---|---:|---|---|---|
| S.PELLEGRINO (CX 75CL×15) | 2 | un | CASE | Valid pipeline; unmatched |
| PACCHERI (CX 1KG×6) | 2 | un | CASE | Valid pipeline; unmatched |
| RICOTTA 1,5KG | 2 | un | COUNTABLE | pq=2; verify `total` at confirm |

---

## Mammafiore — multipack name on countable unit

| Product | Qty | Unit | Pipeline | Risk |
|---|---:|---|---|---|
| Peroni 33cl×24 | 24 | un | pq=330ml, op=€0.0032/ml | SUSPICIOUS — volume-cost routing, math OK |
| Balsamic 5l×2 | 1 | un | pq=5000ml, op=€0.0031/ml | SUSPICIOUS — `packMeasureCostFieldsFromSingleCountable` |

Both are unmatched. Math is coherent but unusual heuristic path.

---

## Verdict

- **Confirmed ingredients:** edge tokens (saco, lata, frasco, emb, dúzia) handled correctly. Low risk.
- **Emporio `g`/`ml` OCR:** **HIGH risk** — primary caution for future Review & Create.
- **Mammafiore volume routing:** SUSPICIOUS but not INCORRECT.
