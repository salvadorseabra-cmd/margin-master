# Pepino Diff — Virtual vs Persisted

**Generated:** 2026-06-14

---

## Reference

| Field | Value |
|-------|-------|
| Item ID | `c715f6ad-e685-4e7b-ae9c-e369848f08a5` |
| Line text | Pepino |
| Supplier | Bidfood Portugal |

---

## Comparison

| Field | Virtual | Persisted |
| --- | --- | --- |
| `displayState` / `status` | confirmed | suggested |
| `match.kind` / `match_kind` | exact | exact |
| `ingredient_id` | 635a1189-36ea-4ff2-9012-8172ab1ab81d | 635a1189-36ea-4ff2-9012-8172ab1ab81d |
| Expected persisted status | suggested | — |
| Alignment | aligned | intentional |

---

## Verdict

**Intentional drift confirmed** — virtual `confirmed` (bare `exact`) vs persisted `suggested`; same `ingredient_id`.
