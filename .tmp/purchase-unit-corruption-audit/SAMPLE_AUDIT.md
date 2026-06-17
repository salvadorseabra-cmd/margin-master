# Sample Audit — 9 Ingredients

| Ingredient | Invoice Packaging | Parsed Result | Correct? |
|------------|-------------------|---------------|----------|
| **Ginger Beer** | 24×20cl @ €0.85 | 2 ml/unit; €425/L; Pack 2 ml | **No** — decimal-cl bug |
| **San Pellegrino** | 2 cx, 15×75cl @ €19.28/cx | 750 ml denominator; €0.03/ml; 15-pack lost | **No** — reverse grammar + pricing |
| **Chocolate Pantagruel** | 10×200g, 1 cx | 10 un, 2000g usable, €1.25/unit | **Yes** |
| **Arroz Agulha** | 12×1kg, 1 cx | 12 un, 12kg usable, €1.16/kg | **Yes** |
| **Paccheri** | 500g name, 24 un (Emporio OCR: 24 g) | Single 500g unit; OCR swap HIGH risk | **Partial** |
| **Gorgonzola** | 1.35 kg @ €9.96/kg | pq=1000g, €9.96/kg | **Yes** |
| **Peroni** | 33cl×24, 24 un @ €1.529 | 330 ml/bottle; misses ×24 pack | **Partial** |
| **Nata Picot** | 6×1L, 1 cx | 6 un, 6000 ml, €3/L | **Yes** |
| **S.PELLEGRINO alt** | `(CX 75CL*15)`, 2 cx | Same 750 ml bare_measure failure | **No** |
