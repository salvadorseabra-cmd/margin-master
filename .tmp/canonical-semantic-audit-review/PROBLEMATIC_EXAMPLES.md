# Problematic Examples — Canonical Semantic Audit

**Date:** 2026-06-15  
**Scope:** 12 / 32 food rows (37.5%)

| Supplier | Invoice | Suggested | Primary | Secondary | Ideal direction |
|----------|---------|-----------|---------|-----------|-----------------|
| Emporio | Rovagnati - Salame Ventricina 2,5 Kg | Rovagnati salame ventricina | **BRAND_LEAK** | — | Salame ventricina |
| Emporio | Arrigoni Formaggi - Gorgonzola DOP Dolce Linea Castello 1/8 - 1,85kg | Arrigoni formaggi gorgonzola DOP dolce linea castello 1/8 | **COMMERCIAL_DESCRIPTOR_LEAK** | BRAND, PACKAGE | Gorgonzola DOP dolce |
| Emporio | Rovagnati - Assaporami Prosciutto Cotto Scelto HC 4,3-4,5KG | Rovagnati assaporami prosciutto cotto scelto HC 4,3 | **COMMERCIAL_DESCRIPTOR_LEAK** | BRAND | Prosciutto cotto scelto |
| Emporio | Rovagnati - Mortadella IGP 'Massima' con Pistacchio 1/2 - 3,5Kg | Rovagnati mortadella IGP 'massima' con pistacchio 1/2 | **BRAND_LEAK** | PACKAGE | Mortadella IGP massima com pistacchio |
| Emporio | SanPellegrino - Acqua in vitro 75cl x 15ud | Sanpellegrino acqua in vitro 75cl 15ud | **PACKAGE_METADATA_LEAK** | COMMERCIAL (OCR) | Água San Pellegrino 75cl |
| Emporio | Rigamonti - Bresaola Punta d'Anca Oro 1/2 - 1,5Kg | Rigamonti bresaola punta d'anca oro 1/2 | **BRAND_LEAK** | PACKAGE | Bresaola punta d'anca oro |
| Mammafiore | Guanciale di suino stagionato +/- 1,5kg*7 Sorrentino | Guanciale di suino stagionato +/ sorrentino | **BRAND_LEAK** | — | Guanciale stagionato |
| Mammafiore | Birra Peroni Nastro Azzurro PNA 33cl*24 Nastro Azzurro | Birra peroni nastro azzurro PNA 33cl nastro azzurro | **COMMERCIAL_DESCRIPTOR_LEAK** | BRAND (duplicate) | Cerveja Peroni Nastro Azzurro 33cl |
| Mammafiore | Farine Speciale pizza 25kg Amoruso | Farine speciale pizza amoruso | **BRAND_LEAK** | — | Farinha especial pizza |
| Bocconcino | MEZZI PACCHERI MANCINI (CX 1KG*6) | Mezzi paccheri mancini | **BRAND_LEAK** | — | Mezzi paccheri |
| Bocconcino | STRACCIATELLA 250 GR | Stracciatella 250gr | **PACKAGE_METADATA_LEAK** | — | Stracciatella |
| Aviludo | Filete de Anchovas Alconfirsta L1 495 g | Filete de anchovas alconfirsta l1 495g | **BRAND_LEAK** | COMMERCIAL, PACKAGE | Filete de anchovas |

**SHOULD_MATCH_EXISTING:** Anchovas may align with catalog **Anchoas** — alias/matching risk.

**Non-food (correct):** `Recargo por combustibili` → `null`.
