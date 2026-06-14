# Confirmed Alias Audit — Virtual vs Persisted

**Generated:** 2026-06-14 · **VL confirmed aliases:** 32 total, 6 lines alias-matched

---

## Audit Rule

Alias-backed line = `match.kind ∈ {confirmed-alias, confirmed-override}`  
Expected: virtual `confirmed` AND persisted `confirmed` with same `ingredient_id`.

---

## Results: 6/6 PASS — 0 Failures

| Product | Invoice | Virtual | Expected Persisted | ingredient_id |
|---------|---------|---------|-------------------|---------------|
| Mozzarella Flor di Latte 2Kg | Aviludo April | confirmed / confirmed-alias | confirmed | 2a99cecd |
| Pepinos Extra II Frasco 6X720g | Aviludo April | confirmed / confirmed-alias | confirmed | 635a1189 |
| Arroz Agulha Metro Chef 12x1kg | Aviludo April | confirmed / confirmed-alias | confirmed | 07a55cf5 |
| Chocolate (April line) | Aviludo April | confirmed / confirmed-alias | confirmed | 43cba6b0 |
| Açúcar branco (April line) | Aviludo April | confirmed / confirmed-alias | confirmed | c46db69a |
| Nata culinária (April line) | Aviludo April | confirmed / confirmed-alias | confirmed | 3d1af48c |

Source: `.tmp/identity-expansion-simulation/all-line-simulations.json` + `schema-trace.json` matched examples.

---

## Non-Alias Confirmed (Excluded from Alias Audit)

| Product | Virtual | Persisted | Result |
|---------|---------|-----------|--------|
| Pepino (Bidfood) | confirmed (`exact`) | suggested | **Expected drift** — not alias-backed |

---

## Failures

**None** for alias-backed matches.
