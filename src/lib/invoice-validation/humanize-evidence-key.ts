const EVIDENCE_KEY_LABELS: Record<string, string> = {
  check: "Check",
  confidence: "Confidence",
  invoice_implied_cost: "Price per unit (from invoice)",
  item_name: "Item name",
  line_total: "Invoice total",
  ocr_quantity: "Quantity on PDF",
  pack_structure: "Detected package",
  pass_c_quantity: "Quantity on row",
  purchased_weight_kg: "Invoice quantity",
  quantity: "Invoice quantity",
  row_unit: "Invoice unit",
  structure_usable_kg: "Detected package weight",
  suggested_ingredient: "Suggested ingredient",
  total: "Invoice total",
  unit: "Invoice unit",
  unit_price: "Invoice unit price",
  usable_quantity: "Usable quantity",
  usable_quantity_unit: "Usable quantity unit",
};

const PRESERVE_WORDS = new Set(["kg", "g", "l", "lt", "un", "EUR", "OCR", "vs"]);

function humanizeWord(word: string): string {
  const lower = word.toLowerCase();
  if (lower === "eur") return "EUR";
  if (PRESERVE_WORDS.has(lower)) return lower;
  if (word.length <= 3 && word === word.toUpperCase()) return word;
  return lower;
}

/** snake_case evidence keys → readable labels (generic, not per finding code). */
export function humanizeEvidenceKey(key: string): string {
  const override = EVIDENCE_KEY_LABELS[key];
  if (override) return override;

  const words = key.split("_").map(humanizeWord);
  if (words.length === 0) return key;
  return [words[0]!.charAt(0).toUpperCase() + words[0]!.slice(1), ...words.slice(1)].join(" ");
}
