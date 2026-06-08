/**
 * Rollback 10 rows repaired outside Wave 2A allowlist (second accidental execute).
 */
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

const EXTRA_OUTSIDE_ALLOWLIST = [
  "86a6eb99-67eb-4195-8a7a-72f042c6ec03",
  "e62538a6-b433-4d0d-bdf0-9705577d7278",
  "1f2e32a5-b285-46a5-ad63-43d322fc88c3",
  "c269222d-d014-446d-b1af-05a23cb149a5",
  "e2107545-cc7d-449c-9d3d-bcfac993f8b6",
  "05e151f0-8f10-4e3c-9236-bb60cc1ae56a",
  "883f5221-b164-4a19-a3df-a5929f01649a",
  "e9c7b104-f8b6-40b4-8737-3d2f600d905b",
  "753f59ef-e402-4075-a16a-b2497d37f6e3",
  "ebb8346b-f216-41d7-8fae-5675da1cc327",
];

const backup = JSON.parse(readFileSync(process.argv[2]!, "utf8")) as Array<{
  id: string;
  previous_price: number | null;
  new_price: number;
  delta: number | null;
  delta_percent: number | null;
}>;

const sb = createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const results: Array<{ id: string; ok: boolean; error?: string }> = [];
for (const id of EXTRA_OUTSIDE_ALLOWLIST) {
  const row = backup.find((r) => r.id === id);
  if (!row) {
    results.push({ id, ok: false, error: "not in backup" });
    continue;
  }
  const { error } = await sb
    .from("ingredient_price_history")
    .update({
      previous_price: row.previous_price,
      new_price: row.new_price,
      delta: row.delta,
      delta_percent: row.delta_percent,
    })
    .eq("id", id);
  results.push({ id, ok: !error, error: error?.message });
}

console.log(
  JSON.stringify(
    {
      rolled_back: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok),
      allowlist_preserved: [...ALLOWLIST],
    },
    null,
    2,
  ),
);
