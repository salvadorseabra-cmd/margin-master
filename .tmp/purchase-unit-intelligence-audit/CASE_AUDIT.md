# Case Audit — VL (`cx`, `caixa`, `case`, `carton`)

**Mode:** Read-only · **VL:** `bjhnlrgodcqoyzddbpbd` · **Queried:** 2026-06-15 (live)  
**Focus:** How case units are interpreted and whether pricing is coherent.

---

## Summary

| Verdict | Count |
|---|---:|
| **VALID** | **3** |
| SUSPICIOUS | 0 |
| INCORRECT | 0 |

---

## Case lines (3)

| Invoice | Product | Row | Interpretation | Pack € | Op € | Match | Verdict |
|---|---|---|---:|---:|---:|---|---|
| Bidfood | Ovo MORENO Cx.15 dúzias | 1 **cx** | Single case @ case price | 38.44 | 38.44/case | unmatched | **VALID** |
| Bocconcino | PACCHERI (CX 1KG×6) | 2 **un** | 2 cases, pq=2 | 27.36 | 13.68/case | unmatched | VALID |
| Bocconcino | S.PELLEGRINO (CX 75CL×15) | 2 **un** | 2 cases, pq=2 | 23.29 | 11.645/case | unmatched | VALID |

---

## Interpretation paths

### `cx` row unit (Bidfood eggs)

- Row unit `cx` → CASE classification.
- `dúzia` in name (`Cx.15 dúzias`) parsed as single case at case price.
- No inner unit count extracted; `purchase_qty=1`, operational = pack price.
- Coherent: 1 case @ €38.44.

### `un` row unit with embedded `CX` in name (Bocconcino)

- Name contains `CX 1KG*6` / `CX 75CL*15` → CASE classification despite `un` row unit.
- `qty=2` with per-item unit price → `purchase_qty=2`, op = unit_price (per case).
- Pipeline correctly treats as 2 cases, not 2 individual units.

### `cx` on Aviludo multipacks (not in CASE class)

Aviludo lines with `cx` row unit but `NxM` in name (Pepinos, Arroz, Açúcar, Chocolate, Nata) route through **MULTIPACK** path via `resolveUnitsPerPack`, not the countable `un` double-divide path. This is why Pepino/Arroz were never affected by the Atum bug.

---

## Coherence check

| Check | Result |
|---|---|
| Case price = qty × unit_price (per-item) | ✅ All three |
| `purchase_qty` matches case count | ✅ |
| History mismatch on confirmed | N/A (all unmatched) |
| Double-divide risk | None — case path bypasses `resolveCountablePurchaseQuantityForCost` |

---

## Verdict

**3/3 VALID.** Case interpretation is coherent on VL. No pricing bugs detected.
