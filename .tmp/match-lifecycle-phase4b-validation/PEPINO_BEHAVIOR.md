# Pepino Behavior — Read Cutover

**Generated:** 2026-06-14

---

| Field | Virtual (flag OFF) | Cutover (flag ON) | Persisted |
| --- | --- | --- | --- |
| Display / status | confirmed | suggested | suggested |
| Outcome | — | persisted_hit | — |
| Intentional drift | — | yes | — |

---

## Expected

Cutover ON: Pepino shows **suggested** (persisted `suggested`) instead of virtual **confirmed** (bare `exact`).
