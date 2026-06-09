import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/integrations/supabase/types";
import { loadEnvFiles } from "../scripts/load-env.mts";

loadEnvFiles();
const sb = createClient<Database>(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY!,
  { auth: { persistSession: false } },
);

const MAY = "3b4cb21f-8b3f-45f3-9f2d-6f15e9f438a2";

const [ing, items, may] = await Promise.all([
  sb.from("ingredients").select("id,name,current_price,purchase_quantity").limit(5),
  sb.from("invoice_items").select("id,name,unit_price,invoice_id").limit(5),
  sb
    .from("invoice_items")
    .select("id,name,quantity,unit,unit_price,total")
    .eq("invoice_id", MAY),
]);

console.log(
  JSON.stringify(
    {
      ingredients: { err: ing.error?.message, n: ing.data?.length, data: ing.data },
      items: { err: items.error?.message, n: items.data?.length, data: items.data },
      may: { err: may.error?.message, n: may.data?.length, data: may.data },
    },
    null,
    2,
  ),
);
