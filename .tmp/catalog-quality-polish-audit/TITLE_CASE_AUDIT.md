# Title Case Audit

**Date:** 2026-06-15

---

## Anomalies in current suggestions

| Anomaly | Rows | Example | Impact |
|---------|-----:|---------|--------|
| **Mid-word uppercase** | 1 | `Rolo DE cabra e vaca` | Visible in catalog UI |
| **Brand not title-cased** | 3 | `san pellegrino`, `peroni`, `Sanpellegrino` | Browse quality |
| **DOP/IGP mid-string** | 2 | Acceptable — protected designation | Keep |

---

## Impact

**~5 rows** with cosmetic casing issues. Fix candidate: brand allowlist in `formatCanonicalIngredientDisplayName` (Peroni, San Pellegrino).

Low effort, medium browse-quality gain. Not a pipeline blocker.
