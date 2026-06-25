import { loadEnvFiles } from "../scripts/load-env.mts";
import { isMatchLifecycleReadCutoverEnabled } from "../src/lib/match-lifecycle-flags.ts";

loadEnvFiles();

const fromDefault = isMatchLifecycleReadCutoverEnabled();
const fromImportMeta = isMatchLifecycleReadCutoverEnabled(import.meta.env);
const fromProcess = isMatchLifecycleReadCutoverEnabled(
  process.env as Record<string, string | undefined>,
);

console.log(
  JSON.stringify(
    {
      isMatchLifecycleReadCutoverEnabled_default: fromDefault,
      via_import_meta_env: fromImportMeta,
      via_process_env_after_loadEnvFiles: fromProcess,
      import_meta_VITE_MATCH_LIFECYCLE_READ_CUTOVER:
        import.meta.env.VITE_MATCH_LIFECYCLE_READ_CUTOVER ?? null,
      process_has_VITE_MATCH_LIFECYCLE_READ_CUTOVER:
        process.env.VITE_MATCH_LIFECYCLE_READ_CUTOVER !== undefined,
    },
    null,
    2,
  ),
);
