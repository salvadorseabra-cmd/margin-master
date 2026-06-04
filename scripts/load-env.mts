import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Same order as Vite dev; later files override earlier keys. */
const VITE_ENV_FILES = [
  ".env",
  ".env.local",
  ".env.development",
  ".env.development.local",
] as const;

function parseEnvLine(line: string): { key: string; val: string } | null {
  const t = line.trim();
  if (!t || t.startsWith("#")) return null;
  const eq = t.indexOf("=");
  if (eq < 0) return null;
  const key = t.slice(0, eq).trim();
  let val = t.slice(eq + 1).trim();
  if (
    (val.startsWith('"') && val.endsWith('"')) ||
    (val.startsWith("'") && val.endsWith("'"))
  ) {
    val = val.slice(1, -1);
  }
  return { key, val };
}

export function loadEnvFiles(cwd = process.cwd()): void {
  for (const name of VITE_ENV_FILES) {
    const envPath = join(cwd, name);
    if (!existsSync(envPath)) continue;
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const parsed = parseEnvLine(line);
      if (!parsed) continue;
      process.env[parsed.key] = parsed.val;
    }
  }
}
