# Affected Row Trace — Produto de Stock

**Date:** 2026-06-15  
**Invoice:** Emporio Italia · `17aa3591-ec98-4c21-89c9-5ae946bc97bb`

---

| Product | Item ID | Extracted (contaminated) | After normalize | Canonical suggestion |
|---------|---------|--------------------------|-----------------|-------------------|
| De Cecco Paccheri | `4472563f-7b0b-47eb-8cd3-3d649abc2af0` | `De Cecco - Paccheri Lisci Nr. 125 - 500g Produto de Stock` | Same | `Paccheri lisci produto de stock` |
| Arrigoni Gorgonzola | `5ee0da49-88a0-49a8-a5e1-57864d9a156c` | `Arrigoni Formaggi - Gorgonzola DOP Dolce Linea Castellapo 1/8*~1,5Kg Produto de Stock` | Same | `…produto de stock` |
| Rovagnati Prosciutto | `c1b5ad61-45ba-4d6a-a4d4-a1572c3e3a7e` | `Rovagnati - Assaporami Prosciutto Cotto Scelto HC 4+ 4,25KG Produto de Stock` | Same | `…produto de stock` |
| Rovagnati Mortadella | `2ecb0631-5eac-4032-b5b5-8afef220115a` | `Rovagnati - Mortadella IGP 'Massima' con Pistacchio 1/2 ~3,5Kg Produto de Stock` | Same | `…produto de stock` |
| SanPellegrino | `24f8d991-2afd-46c8-9a5a-126a3c4aa643` | `SanPellegrino - Acqua in vitro 75cl x 15ud Produto de Stock` | Same | `Sanpellegrino acqua in vitro 75cl 15ud produto de stock` |
| Rigamonti Bresaola | `9dc6e93e-16ca-496b-acda-872d6ce7dfb7` | `Rigamonti - Bresaola Punta d'Anca Oro 1/2 Produto de Stock` | Same | `…produto de stock` |
| Rovagnati Ventricina | `9278eba9-eeda-474c-aa88-271be8d43afc` | `Rovagnati - Salame Ventricina 2,5 Kg Produto de Stock` | Same | `…produto de stock` |

**Clean baseline (Jun 10 historical DB):** all 8 lines without suffix.  
**scorecard-final.json:** clean inputs → correct suggestions (canonical logic fine when extraction clean).
