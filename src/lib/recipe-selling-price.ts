export type RecipeType = "dish" | "prep" | string;

export type RecipeHealthTone = "success" | "warning" | "destructive";

export type RecipeHealth = {
  label:
    | "Add quantities"
    | "No selling price"
    | "Margin protected"
    | "Cost concentration"
    | "Margin pressure"
    | "Margin below target";
  tone: RecipeHealthTone;
  helper: string;
};

export function isPrepRecipe(recipeType: RecipeType | null | undefined): boolean {
  return (recipeType ?? "dish").trim().toLowerCase() === "prep";
}

export function hasRecipeSellingPrice(
  sellingPrice: number | null | undefined,
): sellingPrice is number {
  return sellingPrice != null && Number.isFinite(sellingPrice) && sellingPrice > 0;
}

/** Form field value for a stored selling price (prep with no price stays empty). */
export function recipeSellingPriceToFormValue(
  sellingPrice: number | null | undefined,
  recipeType: RecipeType | null | undefined,
): string {
  if (isPrepRecipe(recipeType) && !hasRecipeSellingPrice(sellingPrice)) {
    return "";
  }
  if (sellingPrice == null) {
    return "";
  }
  return String(Number(sellingPrice));
}

/** Parsed selling price from the form; `null` when prep has no price. */
export function parseRecipeSellingPriceInput(raw: string, recipeType: RecipeType): number | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return isPrepRecipe(recipeType) ? null : 0;
  }

  const value = Number(trimmed);
  if (!Number.isFinite(value)) {
    return isPrepRecipe(recipeType) ? null : 0;
  }

  if (isPrepRecipe(recipeType) && value <= 0) {
    return null;
  }

  return value;
}

/** Value persisted to `recipes.selling_price` (prep may be null). */
export function recipeSellingPriceForSave(raw: string, recipeType: RecipeType): number | null {
  return parseRecipeSellingPriceInput(raw, recipeType);
}

export function validateRecipeSellingPrice(raw: string, recipeType: RecipeType): string | null {
  if (isPrepRecipe(recipeType)) {
    return null;
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return "Selling price is required for dishes.";
  }

  const value = Number(trimmed);
  if (!Number.isFinite(value) || value <= 0) {
    return "Selling price must be greater than zero for dishes.";
  }

  return null;
}

export function computeGrossMarginPct(
  sellingPrice: number | null | undefined,
  totalCost: number,
): number | null {
  if (!hasRecipeSellingPrice(sellingPrice)) {
    return null;
  }

  return ((sellingPrice - totalCost) / sellingPrice) * 100;
}

export function computeFoodCostPct(
  sellingPrice: number | null | undefined,
  totalCost: number,
): number | null {
  if (!hasRecipeSellingPrice(sellingPrice)) {
    return null;
  }

  return (totalCost / sellingPrice) * 100;
}

export function formatOptionalMarginPercent(marginPct: number | null): string {
  return marginPct == null ? "—" : `${marginPct.toFixed(1)}%`;
}

export function getRecipeHealth(
  sellingPrice: number | null | undefined,
  totalCost: number,
  foodCostPercentage: number | null,
  highestContribution: number,
  ingredientCount: number,
  recipeType: RecipeType,
): RecipeHealth {
  if (ingredientCount === 0 || totalCost <= 0) {
    return {
      label: "Add quantities",
      tone: "warning",
      helper: "Add quantities to see margin exposure.",
    };
  }

  if (!hasRecipeSellingPrice(sellingPrice)) {
    if (isPrepRecipe(recipeType)) {
      return {
        label: "No selling price",
        tone: "warning",
        helper: "Operational prep — track food cost and cost drivers; selling price optional.",
      };
    }

    return {
      label: "No selling price",
      tone: "destructive",
      helper: "Ingredient cost needs selling price cover.",
    };
  }

  const grossMargin = foodCostPercentage == null ? null : 100 - foodCostPercentage;
  const concentrationNeedsReview = highestContribution > 65 && ingredientCount > 1;

  if (grossMargin != null && grossMargin >= 65 && !concentrationNeedsReview) {
    return {
      label: "Margin protected",
      tone: "success",
      helper: "Margin protected; cost mix balanced.",
    };
  }

  if (grossMargin != null && grossMargin >= 65) {
    return {
      label: "Cost concentration",
      tone: "warning",
      helper: "Margin strong; primary ingredient drives exposure.",
    };
  }

  if (
    grossMargin != null &&
    (grossMargin >= 55 || (foodCostPercentage != null && foodCostPercentage <= 45))
  ) {
    return {
      label: "Margin pressure",
      tone: "warning",
      helper: "Margin workable; review price cover and top inputs.",
    };
  }

  return {
    label: "Margin below target",
    tone: "destructive",
    helper: "Food cost is eroding margin cover.",
  };
}
