/**
 * Admin backfill: seed invoice_item_matches for existing invoice_items (shadow SoT).
 *
 *   ./node_modules/.bin/vite-node scripts/backfill-invoice-item-matches.mts --dry-run
 *   ./node_modules/.bin/vite-node scripts/backfill-invoice-item-matches.mts
 *   ./node_modules/.bin/vite-node scripts/backfill-invoice-item-matches.mts --invoice-id=<uuid>
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/integrations/supabase/types";
import { buildConfirmedAliasMapFromRows } from "../src/lib/ingredient-alias-memory";
import { loadCanonicalIngredientCatalog } from "../src/lib/ingredient-catalog-load";
import { backfillInvoiceItemMatches } from "../src/lib/invoice-item-match-shadow-seed";
import { loadEnvFiles } from "./load-env.mts";

loadEnvFiles();

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const invoiceIdArg = args.find((arg) => arg.startsWith("--invoice-id="));
const userIdArg = args.find((arg) => arg.startsWith("--user-id="));
const invoiceId = invoiceIdArg?.split("=")[1]?.trim() || undefined;
const userId = userIdArg?.split("=")[1]?.trim() || undefined;

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || "";

if (!url) {
  console.error(
    JSON.stringify({
      error: "Missing VITE_SUPABASE_URL (or SUPABASE_URL). Set it in .env or .env.local.",
    }),
  );
  process.exit(1);
}

if (!serviceRoleKey) {
  console.error(
    [
      "Missing SUPABASE_SERVICE_ROLE_KEY.",
      "Backfill must use the service_role key so invoice_items and invoice_item_matches are not blocked by RLS.",
      "Add to .env.local (never commit):",
      "  SUPABASE_SERVICE_ROLE_KEY=<service_role secret>",
    ].join("\n"),
  );
  process.exit(1);
}

const supabase = createClient<Database>(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const [{ data: aliasRows, error: aliasErr }, catalogResult] = await Promise.all([
  supabase
    .from("ingredient_aliases")
    .select("ingredient_id, alias_name, normalized_alias, supplier_name")
    .eq("confirmed_by_user", true),
  loadCanonicalIngredientCatalog(supabase),
]);

if (aliasErr) {
  console.error(JSON.stringify({ error: aliasErr.message }));
  process.exit(1);
}
if (catalogResult.error) {
  console.error(JSON.stringify({ error: catalogResult.error }));
  process.exit(1);
}

const confirmedAliases = buildConfirmedAliasMapFromRows(aliasRows ?? []);

const result = await backfillInvoiceItemMatches(
  supabase,
  catalogResult.rows,
  confirmedAliases,
  {
    dryRun,
    invoiceId,
    userId,
  },
);

console.log(
  JSON.stringify(
    {
      mode: dryRun ? "dry-run" : "apply",
      attempted: result.attempted,
      upserted: result.upserted,
      skipped: result.skipped,
      errors: result.errors,
      byStatus: result.byStatus,
      coverage: result.coverage,
    },
    null,
    2,
  ),
);

if (result.errors.length > 0) {
  process.exit(1);
}
