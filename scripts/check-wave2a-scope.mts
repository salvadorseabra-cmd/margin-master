import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/integrations/supabase/types";

const ALLOWLIST = new Set([
  "45c891bb-06b0-4268-a785-71bb7e40a0d7",
  "8651aa39-fe42-49cc-9a40-283defb9042b",
  "2aa734f1-91fc-4ca3-b97a-8e01b3bf7916",
  "92162d54-9d0c-4f96-8798-85f232e69f9b",
  "22db9eb8-24f3-443e-9b04-da3ecda170e7",
  "22c8efba-8464-487e-a69e-3457c7b857e4",
  "19225c9b-fa2f-42de-9ac9-cf660c8536b8",
  "f5a55cf8-4116-4b0a-8ebc-0ef2967e7037",
  "fe28be38-eb32-4b72-93d2-6289111d0b71",
  "38651eea-7bf1-4911-92cf-fd0eef36d6fc",
]);

const backup = JSON.parse(readFileSync(process.argv[2]!, "utf8")) as Array<{
  id: string;
  new_price: number;
  ingredient_name: string | null;
}>;

const sb = createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
const { data: current } = await sb.from("ingredient_price_history").select("id,new_price,ingredient_name");

const changed = (current ?? []).filter((r) => {
  const b = backup.find((x) => x.id === r.id);
  if (!b) return false;
  return Number(b.new_price) !== Number(r.new_price);
});

const outsideAllowlist = changed.filter((r) => !ALLOWLIST.has(r.id));
const insideAllowlist = changed.filter((r) => ALLOWLIST.has(r.id));

console.log(
  JSON.stringify(
    {
      total_changed: changed.length,
      inside_allowlist: insideAllowlist.length,
      outside_allowlist: outsideAllowlist.length,
      outside_allowlist_rows: outsideAllowlist.map((r) => ({
        id: r.id,
        ingredient: r.ingredient_name,
        old_new: backup.find((b) => b.id === r.id)?.new_price,
        new_new: r.new_price,
      })),
    },
    null,
    2,
  ),
);
