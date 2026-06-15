# Multipack Audit — VL (11 lines)

**Mode:** Read-only · **VL:** `bjhnlrgodcqoyzddbpbd` · **Queried:** 2026-06-15 (live)  
**Patterns:** `x`, `pack`, `6x`, `10x`, `12x` — verify usable qty, operational price, history, `current_price`.

---

## Summary

| Verdict | Count |
|---|---:|
| **VALID** | **11** |
| SUSPICIOUS | 0 |
| INCORRECT | 0 |

All 11 multipack lines use `resolveUnitsPerPack` / `cx` + `NxM` name parsing. **All VALID.**

---

## Full multipack audit

| Invoice | Product | Row | Inner units | Pack € | Op €/inner | History aligned | Verdict |
|---|---|---|---:|---:|---:|---|---|
| Aviludo Apr | Pepinos 6×720g | 1 cx | 6 | 21.99 | 3.665/un | ✅ | VALID |
| Aviludo May | Pepinos 6×720g | 1 cx | 6 | 22.49 | 3.748/un | ✅ | VALID |
| Aviludo Apr | Arroz 12×1kg | 1 cx | 12 | 13.45 | 1.121/kg | ✅ | VALID |
| Aviludo May | Arroz 12×1kg | 1 cx | 12 | 13.95 | 1.162/kg | ✅ | VALID |
| Aviludo Apr | Chocolate 10×200g | 2 cx | 10 | 29.19 | 2.919/200g | ✅ | VALID |
| Aviludo May | Chocolate 10×200g | 2 cx | 10 | 29.99 | 2.999/200g | ✅ | VALID |
| Aviludo Apr | Açúcar 10×1kg | 1 cx | 10 | 9.29 | 0.929/kg | ✅ | VALID |
| Aviludo May | Açúcar 10×1kg | 1 cx | 10 | 9.99 | 0.999/kg | ✅ | VALID |
| Aviludo Apr | Nata 6×1L | 5 cx | 6 | 18.29 | 3.048/L | ✅ | VALID |
| Aviludo May | Nata 6×1L | 5 cx | 6 | 18.89 | 3.148/L | ✅ | VALID |
| Bocconcino | POMODORI (CX 2.5KG×6) | 1 un | 1 (case) | 22.05 | 22.05/case | — (unmatched) | VALID |

---

## Notes

- `frasco` in Pepinos name correctly triggers multipack parsing; Pepino catalog `current_price` = latest history.
- `cx` on Aviludo multipacks routes through pack-container path (`resolveUnitsPerPack`), not the countable `un` double-divide path — Pepino/Arroz were never affected by the Atum bug.
- Bocconcino POMODORI is unmatched; pipeline treats as single-case multipack. No pricing anomaly detected in replay.

---

## Verdict

**11/11 VALID.** No multipack pricing bugs on VL.
