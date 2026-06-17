# Before / After Examples — Phase 4

**Pipeline:** `buildCanonicalIngredientCreateDefaults` → `formatCanonicalIngredientDisplayName`

| Invoice | Before | After | Transition |
|---------|--------|-------|------------|
| Rovagnati - Salame Ventricina 2,5 Kg | Rovagnati salame ventricina | **Salame ventricina** | BRAND_LEAK → GOOD |
| Arrigoni Formaggi - Gorgonzola DOP Dolce Linea Castello 1/8 - 1,85kg | Arrigoni formaggi gorgonzola DOP dolce linea castello 1/8 | **Gorgonzola DOP dolce** | COMMERCIAL → GOOD |
| Rovagnati - Assaporami Prosciutto Cotto Scelto HC 4,3-4,5KG | Rovagnati assaporami prosciutto cotto scelto HC 4,3 | **Prosciutto cotto scelto** | COMMERCIAL → GOOD |
| Rovagnati - Mortadella IGP 'Massima' con Pistacchio 1/2 - 3,5Kg | Rovagnati mortadella IGP 'massima' con pistacchio 1/2 | **Mortadella IGP 'massima' con pistacchio** | BRAND → GOOD |
| Rigamonti - Bresaola Punta d'Anca Oro 1/2 - 1,5Kg | Rigamonti bresaola punta d'anca oro 1/2 | **Bresaola punta d'anca oro** | BRAND → GOOD |
| Birra Peroni Nastro Azzurro PNA 33cl*24 Nastro Azzurro | Birra peroni nastro azzurro PNA 33cl nastro azzurro | **Birra peroni nastro azzurro 33cl** | COMMERCIAL → GOOD |
| Farine Speciale pizza 25kg Amoruso | Farine speciale pizza amoruso | **Farine speciale pizza** | BRAND → GOOD |
| Guanciale di suino stagionato +/- 1,5kg*7 Sorrentino | Guanciale di suino stagionato +/ sorrentino | **Guanciale di suino stagionato** | BRAND → GOOD |
| Filete de Anchovas Alconfirsta L1 495 g | Filete de anchovas alconfirsta l1 495g | **Filete de anchovas 495g** | BRAND → PACKAGE |
| SanPellegrino - Acqua in vitro 75cl x 15ud | Sanpellegrino acqua in vitro 75cl 15ud | **San pellegrino água in vitro 75cl** | PACKAGE → COMMERCIAL |

## Unchanged (regression anchors)

| Invoice | Suggestion |
|---------|------------|
| MOZZA Fior di Latte Expet Julienne 3kg Simonetta | Mozzarella fior di latte julienne |
| De Cecco - Paccheri Lisci Nr. 125 - 500g | Paccheri lisci |
| Baladin - Ginger Beer 0.20cl | Ginger beer |
| ACQUA S.PELLEGRINO (CX 75CL*15) | Água san pellegrino 75cl |
| Aceto balsamico di modena IGP pet 5l*2 Toschi | Aceto balsamico di modena IGP |
| Rulo Di Capra 1kg*2 Simonetta | Rulo di capra |
| RICOTTA TREVIGIANA 1,5KG | Ricotta trevigiana |
| Ovo MORENO Classe M Cx.15 dúzias (CARTÃO) | Ovo classe M |
| Salada Ibérica FSTK EMB. 250g | Salada ibérica |
| Tomilho / Manjericão / Hortelã | unchanged |
| MEZZI PACCHERI MANCINI (CX 1KG*6) | Mezzi paccheri mancini |
| STRACCIATELLA 250 GR | Stracciatella 250gr |
