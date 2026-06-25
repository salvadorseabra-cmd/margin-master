import { isMatchLifecycleReadCutoverEnabled } from "../src/lib/match-lifecycle-flags.ts";

// Vite-only: no manual loadEnvFiles — same as vite-node/vite dev env injection
console.log(
  JSON.stringify(
    {
      isMatchLifecycleReadCutoverEnabled: isMatchLifecycleReadCutoverEnabled(),
      import_meta_VITE_MATCH_LIFECYCLE_READ_CUTOVER:
        import.meta.env.VITE_MATCH_LIFECYCLE_READ_CUTOVER ?? null,
      mode: import.meta.env.MODE,
    },
    null,
    2,
  ),
);
