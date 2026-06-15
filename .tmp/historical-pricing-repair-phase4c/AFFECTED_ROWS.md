# Affected Rows — Phase 4C

**Scope:** 6 history rows · 3 ingredients · VL project `bjhnlrgodcqoyzddbpbd`

| History ID | Ingredient | Invoice period | Issue |
|---|---|---|---|
| `61c51696-acd8-4a58-878f-a588c1878af0` | Atum em óleo | Apr 2026 | `new_price` halved (3.145) |
| `781ab1ac-39d2-4462-9106-635e5603c466` | Atum em óleo | May 2026 | `new_price` OK; delta chain wrong (+316%) |
| `952119dc-8645-4a5f-a3ff-191ae1a57ea8` | Anchoas | Apr 2026 | `new_price` halved (4.745) |
| `908de185-e61a-4f41-af4c-3b70f69bd08f` | Anchoas | May 2026 | `new_price` halved (4.995) |
| `e967f673-1dc5-4390-90e6-464b66ec2a4b` | Gema líquida | Apr 2026 | `new_price` ÷6 (1.698) |
| `e143080d-511b-4c37-9018-11949343aedc` | Gema líquida | May 2026 | `new_price` ÷6 (1.748) |

## Ingredient IDs

| Ingredient | ID |
|---|---|
| Atum em óleo | `0f30ccb3-bb47-40bb-83cc-ae2a4018066d` |
| Anchoas | `c811f67f-df4d-4194-ba8b-7a15d4af38bd` |
| Gema líquida | `32dbf47d-347c-45f3-bd9f-c6e90640e767` |

## Catalog contamination (pre-repair)

| Ingredient | Catalog op (wrong) | True op |
|---|---|---|
| Atum | 13.10 | 13.10 (already correct) |
| Anchoas | 4.995 | 9.99 |
| Gema líquida | 1.748 | 10.49 |
