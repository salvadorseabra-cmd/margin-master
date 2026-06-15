# Implementation Opportunities — Italian Catalog Quality

**Date:** 2026-06-15  
**Status:** Investigation only — no implementation recommended in this pass.

---

## Repeatable patterns (automate)

| Pattern | Rows | Effort | Impact | Risk |
|---------|------|--------|--------|------|
| Charcuterie/cheese `Brand -` prefix strip (Rovagnati, Rigamonti, Arrigoni Formaggi) | 5 Emporio | Low | High | Low |
| Wheel fraction strip (`1/2`, `1/8`, `1/4`) | 3 Emporio | Low | High | Low |
| Supplier code strip (`HC`, weight ranges) | 1–2 | Low | Medium | Low |
| `Assaporami` marketing line strip | 1 | Low | Medium | Low |
| San Pellegrino Emporio: strip `x Nud`, `acqua`→`água`, title-case brand | 1 | Low | Medium | Low |
| `Formaggi` noise token | 1 | Low | Medium | Low |
| Peroni duplicate token + PNA strip | 1 | Low | Medium | Low |

**Scoped automation estimate:** ~2–3 days, ~8–10 rows improved to EXCELLENT.

**Full Italian premium ontology:** ~2+ weeks — **not justified** at current volume.

---

## Isolated / manual-review cases

| Case | Why manual |
|------|-----------|
| Gorgonzola Castello line | OCR varies; sub-line depends on multi-SKU context |
| Mancini on paccheri | Depends on whether multiple paccheri brands stocked |
| Stracciatella 250g | Operational pack — kitchen practice dependent |
| Guanciale `di suino` | Style preference |
| Baladin 0.20cl | Extraction/OCR, not naming |

---

## Pipeline gap

Current code strips De Cecco/Baladin and Mammafiore distributor suffixes well, but **Emporio charcuterie/cheese lines retain brand + purchase debris** because they lack charcuterie-specific strip rules. San Pellegrino Bocconcino path works; Emporio path retains `15ud` and lowercase `sanpellegrino`.

---

## Automation vs manual

| Question | Answer |
|----------|--------|
| Automation justified? | **Yes — narrow scope** (deterministic strip lists, same family as Phase 2/3) |
| Manual review sufficient? | **Yes for current VL volume** (~21 rows). Automation pays off as Italian supplier volume grows. |
