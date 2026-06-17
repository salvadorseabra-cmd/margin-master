# Invoice Ground Truth — Baladin Ginger Beer

**Invoice:** `17aa3591-ec98-4c21-89c9-5ae946bc97bb` (Emporio Italia)

---

## Visible invoice row

```
BBB-GINGER33ITA | 30-06-2027 | Baladin - Ginger Beer 0.20cl | IVA23 | 24,00 | 0,85 € | 5.00 | 19,38 €
```

| Field | Value |
|-------|-------|
| Raw description | `Baladin - Ginger Beer 0.20cl` |
| Product code (PDF only) | `BBB-GINGER33ITA` (not persisted) |
| Quantity | **24,00** |
| Unit price | **€0.85** |
| Discount | 5.00% |
| Line total | **€19.38** |

---

## Arithmetic validation

```
24 × €0.85 × (1 − 0.05) = 24 × 0.85 × 0.95 = €19.38 ✓
```

Alternative case framing (same total):

```
2 cases × €9.69 = €19.38 ✓   where €9.69 = 12 × (€0.85 × 0.95)
```

The **visible Qtd column prints 24**, not 2.
