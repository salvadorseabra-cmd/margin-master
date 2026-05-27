export type RecipeLinePickerKind = "ingredient" | "prep";

export type RecipeLinePickerOption = {
  kind: RecipeLinePickerKind;
  id: string;
  name: string;
  unit: string | null;
  pickerValue: string;
};

const PICKER_PREFIX = {
  ingredient: "ingredient",
  prep: "prep",
} as const;

export function recipeLinePickerValue(kind: RecipeLinePickerKind, id: string): string {
  return `${PICKER_PREFIX[kind]}:${id}`;
}

export function parseRecipeLinePickerValue(
  value: string,
): { kind: RecipeLinePickerKind; id: string } | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const [kind, id] = trimmed.split(":");
  if ((kind === "ingredient" || kind === "prep") && id) {
    return { kind, id };
  }
  return null;
}

export function buildRecipeLinePickerOptions(input: {
  ingredients: Array<{ id: string; name: string; unit: string | null }>;
  prepRecipes: Array<{ id: string; name: string; output_unit: string | null }>;
  excludeRecipeId?: string | null;
}): RecipeLinePickerOption[] {
  const exclude = input.excludeRecipeId?.trim() || null;
  const ingredientOptions: RecipeLinePickerOption[] = input.ingredients.map((row) => ({
    kind: "ingredient",
    id: row.id,
    name: row.name,
    unit: row.unit,
    pickerValue: recipeLinePickerValue("ingredient", row.id),
  }));

  const prepOptions: RecipeLinePickerOption[] = input.prepRecipes
    .filter((row) => row.id !== exclude)
    .map((row) => ({
      kind: "prep",
      id: row.id,
      name: row.name,
      unit: row.output_unit,
      pickerValue: recipeLinePickerValue("prep", row.id),
    }));

  return sortRecipeLinePickerOptions([...ingredientOptions, ...prepOptions]);
}

function sortRecipeLinePickerOptions(options: RecipeLinePickerOption[]): RecipeLinePickerOption[] {
  return [...options].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}

/** Resolve the selected row by picker token or parsed kind/id. */
export function resolveRecipeLinePickerSelection(
  options: RecipeLinePickerOption[],
  value: string,
): RecipeLinePickerOption | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const direct = options.find((option) => option.pickerValue === trimmed);
  if (direct) return direct;

  const parsed = parseRecipeLinePickerValue(trimmed);
  if (!parsed) return undefined;

  return options.find((option) => option.kind === parsed.kind && option.id === parsed.id);
}

/** Keep catalog/prep options and add any currently selected lines missing from the list. */
export function mergeRecipeLinePickerSelections(
  baseOptions: RecipeLinePickerOption[],
  selections: Array<{
    kind: RecipeLinePickerKind;
    id: string;
    name: string;
    unit?: string | null;
  }>,
): RecipeLinePickerOption[] {
  const byPickerValue = new Map(baseOptions.map((option) => [option.pickerValue, option]));

  for (const selection of selections) {
    const id = selection.id.trim();
    if (!id) continue;
    const pickerValue = recipeLinePickerValue(selection.kind, id);
    if (byPickerValue.has(pickerValue)) continue;
    byPickerValue.set(pickerValue, {
      kind: selection.kind,
      id,
      name: selection.name.trim() || (selection.kind === "prep" ? "Prep" : "Unnamed ingredient"),
      unit: selection.unit ?? null,
      pickerValue,
    });
  }

  return sortRecipeLinePickerOptions([...byPickerValue.values()]);
}

export function recipeLinePickerLabel(option: RecipeLinePickerOption): string {
  return option.kind === "prep" ? `${option.name} [Prep]` : option.name;
}

/** cmdk item value — unique per row; include name/kind for search. */
export function recipeLinePickerCommandValue(option: RecipeLinePickerOption): string {
  return `${option.name} ${option.kind} ${option.unit ?? ""} ${option.pickerValue}`;
}

export function recipeLinePickerSearchKeywords(option: RecipeLinePickerOption): string[] {
  const keywords = [option.name, option.kind];
  if (option.unit) keywords.push(option.unit);
  if (option.kind === "prep") keywords.push("prep");
  return keywords;
}
