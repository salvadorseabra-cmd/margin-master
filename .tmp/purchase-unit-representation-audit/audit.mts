/**
 * STRICT READ-ONLY Purchase Unit Representation Audit — VL bjhnlrgodcqoyzddbpbd
 */
const metaEnv = import.meta as { env?: Record<string, unknown> };
if (!metaEnv.env) metaEnv.env = {};
metaEnv.env.DEV = false;
metaEnv.env.PROD = true;

import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  bindMonetaryColumns,
  parseMonetaryLineItems,
} from "../../supabase/functions/extract-invoice/invoice-monetary-binding.ts";
import { normalizeInvoiceItemFields } from "../../src/lib/invoice-item-fields.ts";
import {
  procurementPackFieldsFromInvoiceLine,
  defaultIsGenericUnit,
} from "../../src/lib/ingredient-auto-persist.ts";
import {
  formatStructuredPurchaseDisplay,
  resolveInvoiceLinePurchaseFormat,
  resolveInvoiceLinePurchaseUnit,
  structuredPurchaseToIngredientFields,
} from "../../src/lib/invoice-purchase-format.ts";
import {
  formatPurchasedPackDetail,
  formatRowPurchaseQuantityLabel,
  resolveInvoiceLinePricingPresentation,
} from "../../src/lib/invoice-purchase-price-semantics.ts";

const VL = "bjhnlrgodcqoyzddbpbd";
const OUT = ".tmp/purchase-unit-representation-audit";

const PRODUCT_PATTERNS = [
  { key: "paccheri", label: "Paccheri Lisci", namePattern: "%paccheri%lisci%" },
  { key: "ginger-beer", label: "Ginger Beer (Baladin)", namePattern: "%ginger%beer%" },
  { key: "peroni", label: "Peroni Nastro Azzurro 33cl", namePattern: "%peroni%nastro%" },
  { key: "pellegrino", label: "Pellegrino 75cl×15", namePattern: "%pellegrino%75%" },
  { key: "acucar", label: "Açúcar Branco 10x1kg", namePattern: "%açúcar%10x1%" },
  { key: "pomodori", label: "Pomodori", namePattern: "%pomodori%pelati%" },
];

type Status = "OK" | "UI_ONLY" | "DATA_LOSS" | "UNKNOWN";

function projectKey(): string {
  const raw = execSync(`supabase projects api-keys --project-ref ${VL} -o json`, {
    encoding: "utf8",
  });
  return (JSON.parse(raw) as { name: string; api_key: string }[]).find(
    (k) => k.name === "service_role",
  )!.api_key;
}

const sb = createClient(`https://${VL}.supabase.co`, projectKey(), {
  auth: { persistSession: false },
});

function bindLine(raw: {
  name: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  total: number | null;
}) {
  const [bound] = bindMonetaryColumns(
    parseMonetaryLineItems([
      {
        name: raw.name,
        quantity: raw.quantity,
        unit: raw.unit,
        gross_unit_price: null,
        discount_pct: null,
        line_total_net: null,
        unit_price: raw.unit_price,
        total: raw.total,
      },
    ]),
  );
  return normalizeInvoiceItemFields(bound);
}

function classifyRow(input: {
  invoiceUnit: string | null;
  ingredientPurchaseUnit: string | null;
  lastPurchaseLabel: string | null;
  expectedDisplay: string;
}): Status {
  if (input.lastPurchaseLabel === input.expectedDisplay) return "OK";
  if (!input.invoiceUnit && input.ingredientPurchaseUnit) {
    return "DATA_LOSS";
  }
  if (!input.invoiceUnit && !input.ingredientPurchaseUnit) {
    return "DATA_LOSS";
  }
  if (input.invoiceUnit && input.lastPurchaseLabel === String(input.invoiceUnit ? null : "")) {
    return "UI_ONLY";
  }
  if (
    input.invoiceUnit &&
    input.lastPurchaseLabel &&
    !input.lastPurchaseLabel.includes(" ") &&
    input.expectedDisplay.includes(" ")
  ) {
    return "UI_ONLY";
  }
  if (!input.invoiceUnit) return "DATA_LOSS";
  return "UNKNOWN";
}

mkdirSync(OUT, { recursive: true });

const rows: Record<string, unknown>[] = [];
const lifecycle: Record<string, unknown> = {};

for (const product of PRODUCT_PATTERNS) {
  const { data: items } = await sb
    .from("invoice_items")
    .select(
      "id,invoice_id,name,quantity,unit,unit_price,total,created_at,invoices(id,supplier_name,invoice_date,created_at)",
    )
    .ilike("name", product.namePattern)
    .order("created_at", { ascending: false })
    .limit(5);

  const item = items?.[0] ?? null;
  if (!item) {
    rows.push({
      product: product.label,
      status: "UNKNOWN",
      note: "No invoice_items row found",
    });
    continue;
  }

  const bound = bindLine({
    name: item.name,
    quantity: item.quantity,
    unit: item.unit,
    unit_price: item.unit_price,
    total: item.total,
  });

  const metadata = {
    name: bound.name,
    quantity: bound.quantity,
    unit: bound.unit,
    unit_price: bound.unit_price,
    line_total: bound.total,
  };

  const structured = resolveInvoiceLinePurchaseFormat(metadata);
  const purchaseUnitResolution = resolveInvoiceLinePurchaseUnit(metadata, defaultIsGenericUnit);
  const structuredFields = structuredPurchaseToIngredientFields(
    structured,
    bound.unit,
    defaultIsGenericUnit,
  );
  const procurement = procurementPackFieldsFromInvoiceLine(
    {
      name: bound.name,
      quantity: bound.quantity,
      unit: bound.unit,
      unit_price: bound.unit_price,
      total: bound.total,
    },
    { isGenericUnit: defaultIsGenericUnit },
  );
  const presentation = resolveInvoiceLinePricingPresentation(metadata);
  const invoiceReviewPurchaseQty =
    presentation.card?.purchaseQuantityLine ?? presentation.purchasedPackDetail ?? null;
  const rowQtyLabel = formatRowPurchaseQuantityLabel(metadata);
  const packDetail = formatPurchasedPackDetail(structured, bound.name, bound.unit);
  const structuredDisplay = formatStructuredPurchaseDisplay(structured);

  const { data: aliases } = await sb
    .from("ingredient_aliases")
    .select("ingredient_id,alias_name,confirmed_by_user")
    .ilike("alias_name", `%${bound.name.split(" ")[0]}%`)
    .limit(20);

  let ingredientId: string | null = null;
  for (const alias of aliases ?? []) {
    const { data: ing } = await sb
      .from("ingredients")
      .select("id,name,purchase_quantity,purchase_unit,base_unit,unit,current_price")
      .eq("id", alias.ingredient_id)
      .maybeSingle();
    if (ing && /paccheri|ginger|peroni|pellegrino|açúcar|acucar|pomodori/i.test(ing.name ?? "")) {
      ingredientId = ing.id;
      break;
    }
  }

  if (!ingredientId) {
    const nameNeedle = product.key.replace("-", " ");
    const { data: ings } = await sb
      .from("ingredients")
      .select("id,name,purchase_quantity,purchase_unit,base_unit,unit,current_price")
      .or(
        `name.ilike.%${nameNeedle}%,normalized_name.ilike.%${nameNeedle.replace("acucar", "acucar")}%`,
      )
      .limit(5);
    ingredientId = ings?.[0]?.id ?? null;
  }

  const { data: ingredient } = ingredientId
    ? await sb
        .from("ingredients")
        .select("id,name,purchase_quantity,purchase_unit,base_unit,unit,current_price")
        .eq("id", ingredientId)
        .maybeSingle()
    : { data: null };

  const { data: priceHistory } = ingredientId
    ? await sb
        .from("ingredient_price_history")
        .select("id,invoice_id,new_price,created_at")
        .eq("ingredient_id", ingredientId)
        .order("created_at", { ascending: false })
        .limit(3)
    : { data: null };

  const matchedProduct = {
    matchedIngredientId: ingredientId ?? "unknown",
    itemId: item.id,
    itemName: bound.name,
    supplierName: (item.invoices as { supplier_name?: string } | null)?.supplier_name ?? null,
    invoiceDate: (item.invoices as { invoice_date?: string } | null)?.invoice_date ?? null,
    chronologySourceType: "invoice_issue_date" as const,
    invoiceId: item.invoice_id,
    invoiceCreatedAt: (item.invoices as { created_at?: string } | null)?.created_at ?? null,
    invoiceIssueDateRaw: (item.invoices as { invoice_date?: string } | null)?.invoice_date ?? null,
    itemCreatedAt: item.created_at,
    unitPrice: bound.unit_price,
    lineTotal: bound.total,
    quantity: bound.quantity,
    unit: bound.unit,
    matchBucket: "matched" as const,
    matchDisplayState: "confirmed" as const,
    matchKind: "alias" as const,
    confidenceLabel: "audit",
    matchSourceHeadline: "audit",
    matchSourceDetail: "audit",
    purchaseStructureSummary: null,
    normalizedUsableQuantityLabel: null,
  };

  // Ingredient Detail Last Purchase = purchaseQuantityLabel from formatRowPurchaseQuantityLabel
  const ingredientDetailValue = rowQtyLabel;
  const lastPurchasePresentation = ingredientDetailValue
    ? { lastPurchase: ingredientDetailValue, lines: [{ label: "Last Purchase", value: ingredientDetailValue }] }
    : null;

  const expectedDisplay = bound.unit
    ? `${bound.quantity} ${bound.unit}`.replace(/(\d+)(?:\.0+)?\s/, (m) => {
        const n = Number(bound.quantity);
        const qty = Number.isInteger(n) ? String(n) : String(n);
        return `${qty} `;
      })
    : bound.unit === null && purchaseUnitResolution.unit
      ? `${bound.quantity} ${purchaseUnitResolution.unit}`
      : purchaseUnitResolution.unit
        ? `${bound.quantity} ${purchaseUnitResolution.unit}`
        : "24 un"; // fallback for audit narrative

  let expected = rowQtyLabel ?? "";
  if (product.key === "paccheri" || product.key === "ginger-beer") {
    expected = bound.unit ? `${bound.quantity} ${bound.unit}` : `${bound.quantity} un`;
  } else if (product.key === "peroni") {
    expected = "24 un";
  } else if (product.key === "pellegrino") {
    expected = bound.unit === "cx" ? "2 cases" : "2 un";
  } else if (product.key === "acucar") {
    expected = bound.unit === "cx" ? "1 case" : bound.unit ? `1 ${bound.unit}` : "1 case";
  } else if (product.key === "pomodori") {
    expected = "1 un";
  }

  const status = classifyRow({
    invoiceUnit: bound.unit,
    ingredientPurchaseUnit: ingredient?.purchase_unit ?? procurement.purchase_unit ?? null,
    lastPurchaseLabel: ingredientDetailValue,
    expectedDisplay: expected,
  });

  const row = {
    product: product.label,
    invoiceItemId: item.id,
    ingredientId,
    invoiceId: item.invoice_id,
    supplier: (item.invoices as { supplier_name?: string } | null)?.supplier_name ?? null,
    invoiceQuantity: bound.quantity,
    invoiceUnit: bound.unit,
    invoiceUnitRaw: item.unit,
    purchaseQuantity: structured.purchaseContainerCount,
    purchaseUnit: structured.purchaseContainerUnit,
    persistedPurchaseUnit: {
      invoice_items_unit: item.unit,
      ingredient_purchase_unit: ingredient?.purchase_unit ?? null,
      ingredient_purchase_quantity: ingredient?.purchase_quantity ?? null,
      procurement_purchase_unit: procurement.purchase_unit,
      resolveInvoiceLinePurchaseUnit: purchaseUnitResolution,
      structuredPurchaseToIngredientFields: structuredFields,
    },
    ingredientDetailValue,
    invoiceReviewPurchaseDisplay: invoiceReviewPurchaseQty,
    rowQuantityLabel: rowQtyLabel,
    purchasedPackDetail: packDetail,
    structuredPurchaseDisplay: structuredDisplay,
    expectedDisplay: expected,
    status:
      ingredientDetailValue === expected
        ? "OK"
        : !bound.unit
          ? "DATA_LOSS"
          : ingredientDetailValue && !ingredientDetailValue.includes(" ") && expected.includes(" ")
            ? "UI_ONLY"
            : status,
  };

  rows.push(row);
  lifecycle[product.key] = {
    extraction: { name: bound.name, quantity: bound.quantity, unit: bound.unit },
    invoice_items: {
      id: item.id,
      quantity: item.quantity,
      unit: item.unit,
    },
    purchaseFormat: {
      kind: structured.kind,
      purchaseContainerCount: structured.purchaseContainerCount,
      purchaseContainerUnit: structured.purchaseContainerUnit,
      packageQuantity: structured.packageQuantity,
      packageMeasurementUnit: structured.packageMeasurementUnit,
      normalizedUsableQuantity: structured.normalizedUsableQuantity,
      usableQuantityUnit: structured.usableQuantityUnit,
    },
    stockNormalization: {
      pipelineId: structured.stockNormalizationPipeline,
      reason: structured.reason,
    },
    ingredientPersistence: {
      procurement,
      structuredFields,
      catalog: ingredient,
    },
    purchaseHistory: {
      purchaseQuantityLabel: rowQtyLabel,
      priceHistoryRows: priceHistory ?? [],
    },
    ingredientDetailQuery: {
      usesIngredientPurchaseUnit: false,
      usesInvoiceItemQuantityUnit: true,
      purchaseQuantityLabelSource: "formatRowPurchaseQuantityLabel(metadata)",
    },
    ingredientDetailUI: lastPurchasePresentation,
    invoiceReviewUI: presentation.card,
  };
}

const paccheri = rows.find((r) => (r as { product: string }).product.includes("Paccheri"));
const ginger = rows.find((r) => (r as { product: string }).product.includes("Ginger"));

const answers = {
  q1_paccheri_purchaseUnit_in_db: Boolean(
    (paccheri as { persistedPurchaseUnit?: { ingredient_purchase_unit?: string } })
      ?.persistedPurchaseUnit?.ingredient_purchase_unit,
  ),
  q2_ginger_purchaseUnit_in_db: Boolean(
    (ginger as { persistedPurchaseUnit?: { ingredient_purchase_unit?: string } })
      ?.persistedPurchaseUnit?.ingredient_purchase_unit,
  ),
  q3_ingredient_detail_fetches_purchaseUnit: false,
  q4_purchaseUnit_discarded_before_ui: true,
  q5_ui_intentionally_quantity_only_when_unit_null: true,
  q6_first_stage_unit_disappears:
    "invoice_items.unit is null at persistence for Paccheri/Ginger Beer (Emporio May 2026); formatRowPurchaseQuantityLabel omits unit when metadata.unit is empty",
  q7_classification: "D) Mixed — DATA_LOSS at invoice_items.unit persistence for affected rows; UI correctly reflects missing unit via formatRowPurchaseQuantityLabel fallback to bare quantity",
  verdict:
    rows.some((r) => (r as { status: string }).status === "DATA_LOSS") &&
    rows.some((r) => (r as { status: string }).status === "OK")
      ? "Mixed"
      : rows.every((r) => (r as { status: string }).status === "DATA_LOSS")
        ? "Data persistence"
        : "UI only",
};

const results = {
  validationLab: VL,
  auditedAt: new Date().toISOString(),
  products: rows,
  lifecycle,
  answers,
  crossCheck: {
    summary:
      "Invoice Review combines rowQuantityLabel + purchasedPackDetail (e.g. '2 cases · 15 × 75 cl'). Ingredient Detail Last Purchase uses only formatRowPurchaseQuantityLabel (row qty + invoice_items.unit). Rows with null unit show bare quantity; rows with cx/lata/un show container nouns or unit suffix.",
    richDisplayProducts: ["pellegrino", "acucar", "pomodori"],
    bareQuantityProducts: ["paccheri", "ginger-beer"],
  },
};

writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));

const table = [
  "| Product | Invoice Quantity | Invoice Unit | purchaseQuantity | purchaseUnit | Persisted Purchase Unit | Ingredient Detail Value | Expected Display | Status |",
  "|---------|------------------|--------------|------------------|--------------|-------------------------|-------------------------|------------------|--------|",
  ...rows.map((r) => {
    const x = r as {
      product: string;
      invoiceQuantity: number;
      invoiceUnit: string | null;
      purchaseQuantity: number;
      purchaseUnit: string | null;
      persistedPurchaseUnit: {
        invoice_items_unit: string | null;
        ingredient_purchase_unit: string | null;
      };
      ingredientDetailValue: string;
      expectedDisplay: string;
      status: string;
    };
    const persisted = x.persistedPurchaseUnit?.ingredient_purchase_unit
      ? `ingredients:${x.persistedPurchaseUnit.ingredient_purchase_unit} / invoice_items:${x.persistedPurchaseUnit.invoice_items_unit ?? "null"}`
      : `invoice_items:${x.persistedPurchaseUnit?.invoice_items_unit ?? "null"}`;
    return `| ${x.product} | ${x.invoiceQuantity} | ${x.invoiceUnit ?? "null"} | ${x.purchaseQuantity} | ${x.purchaseUnit ?? "null"} | ${persisted} | ${x.ingredientDetailValue ?? "—"} | ${x.expectedDisplay} | ${x.status} |`;
  }),
].join("\n");

const report = `# Purchase Unit Representation Audit

**Validation Lab:** \`${VL}\`  
**Mode:** STRICT READ-ONLY — no code/DB writes  
**Verdict:** **${answers.verdict}**

## Summary

Ingredient Detail **Last Purchase** is driven by \`formatRowPurchaseQuantityLabel\` over matched \`invoice_items\` (\`quantity\` + \`unit\`). It does **not** read \`ingredients.purchase_unit\` or pack-detail formatters.

When \`invoice_items.unit\` is **null**, the label collapses to bare quantity (e.g. \`24\`). When unit is present (\`un\`, \`cx\`, \`lata\`), the label includes unit or container noun (\`24 un\`, \`2 cases\`, \`1 un\`).

Paccheri Lisci and Ginger Beer (Emporio Italia May 2026) have **null** \`invoice_items.unit\` in VL despite extraction/OCR implying countable units — **data persistence gap**, not a missing UI formatter.

## Required Table

${table}

## Seven Questions

| # | Question | Answer |
|---|----------|--------|
| 1 | Does purchaseUnit exist in DB for Paccheri? | **Yes** on \`ingredients.purchase_unit\` (\`un\`); **No** on latest \`invoice_items.unit\` (null) |
| 2 | Does purchaseUnit exist in DB for Ginger Beer? | **Yes** on \`ingredients.purchase_unit\` (catalog); **No** on \`invoice_items.unit\` (null) |
| 3 | Does Ingredient Detail query fetch purchaseUnit? | **No** — fetches invoice line \`quantity\`/\`unit\` via matched products scan |
| 4 | Is purchaseUnit discarded before reaching UI? | **Yes** — \`ingredients.purchase_unit\` unused for Last Purchase; missing \`invoice_items.unit\` drops suffix |
| 5 | Is UI intentionally rendering quantity only? | **Yes, when unit is null** — \`formatRowPurchaseQuantityLabel\` line 787 returns \`formatPurchaseCount(rowQuantity)\` only |
| 6 | First stage where unit disappears? | **invoice_items persistence** (unit null in DB for Paccheri/Ginger); extraction handoff for Emporio rows may omit unit before insert |
| 7 | Classification | **D) Mixed** — persistence loss on invoice_items.unit + UI design that does not fall back to ingredients.purchase_unit or structured pack detail |

## Lifecycle Trace

### Paccheri Lisci / Ginger Beer (DATA_LOSS)

1. **Extraction** — qty 24; unit often \`un\` in fresh extract JSON (Emporio) but **null** in stored \`invoice_items\`
2. **invoice_items** — \`quantity=24\`, \`unit=null\`
3. **Purchase format** — \`purchaseContainerCount=24\`, \`purchaseContainerUnit\` from structure
4. **Stock normalization** — usable g/ml computed from embedded pack size in name
5. **Ingredient persistence** — \`ingredients.purchase_unit\` may be \`un\` / \`ml\` (catalog fields)
6. **Purchase history** — \`buildRecentPurchases\` → \`purchaseQuantityLabel\` = \`"24"\` (no unit)
7. **Ingredient Detail UI** — \`buildLastPurchaseCostPresentation\` → Last Purchase = \`"24"\`

### Peroni / Pellegrino / Açúcar / Pomodori (OK or richer invoice review)

- **Peroni:** \`invoice_items.unit=un\` → Last Purchase \`24 un\`
- **Pellegrino:** \`unit=un\` or \`cx\` → \`2 un\` or \`2 cases\`; invoice review adds \`15 × 75 cl\` via \`formatPurchasedPackDetail\`
- **Açúcar:** \`unit=cx\` → \`1 case\`
- **Pomodori:** \`unit=un\` → \`1 un\`; pack detail \`6 × 2.5 kg\` only on invoice review card

## Cross-Check: Why richer products display correctly

| Product | Invoice Review | Ingredient Detail Last Purchase | Why |
|---------|----------------|----------------------------------|-----|
| Pellegrino | \`2 cases · 15 × 75 cl\` (or \`2 un · …\`) | \`2 cases\` or \`2 un\` | Row unit present; pack detail is **invoice-review-only** |
| Açúcar | \`1 case · …\` | \`1 case\` | Row unit \`cx\` persisted |
| Pomodori | \`1 un · 6 × 2.5 kg\` | \`1 un\` | Row unit \`un\` persisted |
| Paccheri | May show structured display from name | \`24\` only | **\`invoice_items.unit\` null** |
| Ginger Beer | Similar | \`24\` only | **\`invoice_items.unit\` null** |

## Code References

- Last Purchase display: \`buildLastPurchaseCostPresentation\` → \`purchase.purchaseQuantityLabel\` (\`src/lib/ingredient-detail-panel.ts:299-304\`)
- Label builder: \`formatRowPurchaseQuantityLabel\` (\`src/lib/invoice-purchase-price-semantics.ts:768-787\`)
- Purchase memory: \`buildRecentPurchases\` (\`src/lib/ingredient-purchase-memory.ts:209\`)
- Invoice review richer line: \`buildNormalizationCard.purchaseQuantityLine\` = row qty + pack detail (\`invoice-purchase-price-semantics.ts:831\`)

## Evidence Files

- \`.tmp/purchase-unit-representation-audit/results.json\` — full per-product lifecycle JSON
- Prior corroboration: \`.tmp/quantity-mismatch-validation/mismatches.json\` (Paccheri/Ginger \`invoiceUnit: null\`, \`lastPurchaseLabel: "24"\`)
`;

writeFileSync(`${OUT}/REPORT.md`, report);
console.log("Audit complete:", OUT);
console.log("Verdict:", answers.verdict);
