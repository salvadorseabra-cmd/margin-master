import type { jsPDF } from "jspdf";
import { formatDisplayUnitCostForContext } from "@/lib/display-unit-cost";
import { isRecipeLineCostUnresolved, recipeLineCostDisplayCell } from "@/lib/recipe-pricing-state";
import { logRendererPriceTrace } from "@/lib/pricing-trace";

export type TechnicalSheetIngredient = {
  name: string;
  quantity: number;
  unit: string;
  unitCost: number | null;
  lineCost: number | null;
  pricingUnresolved?: boolean;
};

/** Modal recipe cost lines → PDF ingredient rows (same lineCost / unitCost, no rebuild). */
export type RecipeCostLineForTechnicalSheet = {
  line: {
    ingredient_id?: string;
    sub_recipe_id?: string;
    unit?: string;
  };
  ingredient?: { unit?: string | null } | null;
  displayName: string;
  quantity: number;
  unitCost: number | null;
  lineCost: number | null;
  pricingUnresolved: boolean;
};

export function buildTechnicalSheetIngredientsFromCostLines(
  costLines: readonly RecipeCostLineForTechnicalSheet[],
): TechnicalSheetIngredient[] {
  return costLines
    .filter((line) => line.line.ingredient_id || line.line.sub_recipe_id)
    .map((line) => ({
      name: line.displayName || "Unnamed line",
      quantity: line.quantity,
      unit: line.line.unit || line.ingredient?.unit || "",
      unitCost: line.unitCost,
      lineCost: line.lineCost,
      pricingUnresolved: line.pricingUnresolved,
    }));
}

/** Prep batch semantics for PDF (display only — batch food cost unchanged). */
export type PrepYieldTechnicalSheet = {
  batchYield: string;
  servingSize: string;
  estimatedServings: string;
  costPerServing: string;
};

export type RecipeTechnicalSheet = {
  recipeName: string;
  yield?: string | null;
  portionSize?: string | null;
  /** When set, renders a dedicated prep yield block and omits yield/portion from the metadata row. */
  prepYield?: PrepYieldTechnicalSheet | null;
  category?: string | null;
  ingredients: TechnicalSheetIngredient[];
  totalFoodCost: number;
  sellingPrice?: number | null;
  grossMargin?: number | null;
  costIncomplete?: boolean;
  notes?: string | null;
  preparationSteps?: string | null;
};

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN = 16;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const FOOTER_Y = PAGE_HEIGHT - 8;

export async function downloadRecipeTechnicalSheet(sheet: RecipeTechnicalSheet) {
  if (typeof window === "undefined") return;

  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const generatedAt = new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date());
  const generatedTimestamp = new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());

  let y = MARGIN + 1;

  y = drawDocumentHeader(doc, sheet, generatedAt, y, generatedTimestamp);
  y += 4;

  y = drawFinancialSummary(doc, sheet, y, generatedTimestamp);
  y += 4;

  if (sheet.prepYield) {
    y = drawPrepYieldSection(doc, sheet.prepYield, y, generatedTimestamp);
    y += 4;
  } else {
    y = drawOperationalMetadata(doc, sheet, generatedAt, y, generatedTimestamp);
    y += 4;
  }

  y = drawSectionHeader(doc, "Ingredients", y, generatedTimestamp);
  y = drawIngredientsTable(doc, sheet.ingredients, sheet.totalFoodCost, y, generatedTimestamp);

  y += 6;
  y = drawOperationalNotes(doc, sheet, y, generatedTimestamp);

  drawFooter(doc, generatedTimestamp);
  doc.save(`${slugify(sheet.recipeName || "recipe")}-technical-sheet.pdf`);
}

function drawDocumentHeader(
  doc: jsPDF,
  sheet: RecipeTechnicalSheet,
  generatedAt: string,
  y: number,
  generatedTimestamp: string,
) {
  y = ensurePageSpace(doc, y, 28, generatedTimestamp);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(82, 82, 91);
  doc.text("TECHNICAL RECIPE SHEET", MARGIN, y);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(113, 113, 122);
  doc.text(`Issued ${generatedAt}`, PAGE_WIDTH - MARGIN, y, { align: "right" });

  doc.setDrawColor(212, 212, 216);
  doc.line(MARGIN, y + 3, PAGE_WIDTH - MARGIN, y + 3);
  y += 10;

  doc.setTextColor(24, 24, 27);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  y = writeWrappedText(
    doc,
    sheet.recipeName || "Untitled recipe",
    MARGIN,
    y,
    CONTENT_WIDTH,
    6.5,
    generatedTimestamp,
  );

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(113, 113, 122);
  doc.text("Kitchen production reference", MARGIN, y + 1.5);

  return y + 5;
}

function drawFinancialSummary(
  doc: jsPDF,
  sheet: RecipeTechnicalSheet,
  y: number,
  generatedTimestamp: string,
) {
  y = ensurePageSpace(doc, y, 16, generatedTimestamp);

  const foodCostLabel = sheet.costIncomplete
    ? `${formatMoney(sheet.totalFoodCost)} (partial)`
    : formatMoney(sheet.totalFoodCost);
  const columns = [
    { label: "Food cost", value: foodCostLabel },
    {
      label: "Selling price",
      value:
        typeof sheet.sellingPrice === "number" && sheet.sellingPrice > 0
          ? formatMoney(sheet.sellingPrice)
          : "-",
    },
    {
      label: "Gross margin",
      value:
        typeof sheet.grossMargin === "number" && Number(sheet.sellingPrice ?? 0) > 0
          ? `${sheet.grossMargin.toFixed(1)}%`
          : "-",
    },
    { label: "Prep time", value: "-" },
  ];
  const columnWidth = CONTENT_WIDTH / columns.length;
  const blockHeight = 15;

  columns.forEach((column, index) => {
    const x = MARGIN + index * columnWidth;
    const textX = x + (index === 0 ? 0 : 3);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.8);
    doc.setTextColor(113, 113, 122);
    doc.text(column.label.toUpperCase(), textX, y + 5.5);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(24, 24, 27);
    const valueLines = doc.splitTextToSize(column.value, columnWidth - 5).slice(0, 2);
    doc.text(valueLines, textX, y + 11.2);
  });

  return y + blockHeight;
}

function drawPrepYieldSection(
  doc: jsPDF,
  prepYield: PrepYieldTechnicalSheet,
  y: number,
  generatedTimestamp: string,
) {
  y = ensurePageSpace(doc, y, 22, generatedTimestamp);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(82, 82, 91);
  doc.text("PREP BATCH YIELD", MARGIN, y);
  y += 5;

  const columns = [
    { label: "Batch output", value: prepYield.batchYield },
    { label: "Serving size", value: prepYield.servingSize },
    { label: "Est. servings", value: prepYield.estimatedServings },
    { label: "Cost / serving", value: prepYield.costPerServing },
  ];
  const columnWidth = CONTENT_WIDTH / columns.length;

  columns.forEach((column, index) => {
    const x = MARGIN + index * columnWidth;
    const textX = x + (index === 0 ? 0 : 3);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.6);
    doc.setTextColor(113, 113, 122);
    doc.text(column.label.toUpperCase(), textX, y);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(39, 39, 42);
    const valueLines = doc.splitTextToSize(column.value, columnWidth - 5).slice(0, 1);
    doc.text(valueLines, textX, y + 5);
  });

  doc.setDrawColor(228, 228, 231);
  doc.line(MARGIN, y + 11, PAGE_WIDTH - MARGIN, y + 11);

  return y + 14;
}

function drawOperationalMetadata(
  doc: jsPDF,
  sheet: RecipeTechnicalSheet,
  generatedAt: string,
  y: number,
  generatedTimestamp: string,
) {
  y = ensurePageSpace(doc, y, 14, generatedTimestamp);

  const columns = [
    { label: "Yield", value: sheet.yield },
    { label: "Portion size", value: sheet.portionSize },
    { label: "Category", value: sheet.category },
    { label: "Generated", value: generatedAt },
  ];
  const columnWidth = CONTENT_WIDTH / columns.length;

  columns.forEach((column, index) => {
    const x = MARGIN + index * columnWidth;
    const textX = x + (index === 0 ? 0 : 3);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.6);
    doc.setTextColor(113, 113, 122);
    doc.text(column.label.toUpperCase(), textX, y);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(39, 39, 42);
    const valueLines = doc
      .splitTextToSize(cleanMetadataValue(column.value), columnWidth - 5)
      .slice(0, 1);
    doc.text(valueLines, textX, y + 5);
  });

  doc.setDrawColor(228, 228, 231);
  doc.line(MARGIN, y + 9, PAGE_WIDTH - MARGIN, y + 9);

  return y + 12;
}

function drawSectionHeader(doc: jsPDF, title: string, y: number, generatedTimestamp: string) {
  y = ensurePageSpace(doc, y, 12, generatedTimestamp);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(24, 24, 27);
  doc.text(title, MARGIN, y);
  doc.setDrawColor(228, 228, 231);
  doc.line(MARGIN, y + 2.5, PAGE_WIDTH - MARGIN, y + 2.5);
  return y + 6.5;
}

function drawIngredientsTable(
  doc: jsPDF,
  ingredients: TechnicalSheetIngredient[],
  totalFoodCost: number,
  startY: number,
  generatedTimestamp: string,
) {
  let y = ensurePageSpace(doc, startY, 22, generatedTimestamp);
  const rightEdge = PAGE_WIDTH - MARGIN;

  doc.setFillColor(244, 244, 245);
  doc.rect(MARGIN, y, CONTENT_WIDTH, 6, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.8);
  doc.setTextColor(82, 82, 91);
  doc.text("INGREDIENT", MARGIN + 2, y + 4);
  doc.text("QTY", 101, y + 4, { align: "right" });
  doc.text("UNIT", 119, y + 4, { align: "right" });
  doc.text("UNIT COST", 146, y + 4, { align: "right" });
  doc.text("COST", 173, y + 4, { align: "right" });
  doc.text("%", rightEdge - 2, y + 4, { align: "right" });
  y += 6;

  if (ingredients.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(113, 113, 122);
    doc.text("No ingredients added yet.", MARGIN + 2, y + 7);
    return y + 12;
  }

  ingredients.forEach((ingredient, index) => {
    const unresolved = isRecipeLineCostUnresolved(ingredient.lineCost);
    logRendererPriceTrace({
      surface: "technical_sheet_pdf",
      ingredientName: ingredient.name,
      unitCostEur: ingredient.unitCost,
      lineCostEur: ingredient.lineCost,
      unresolved,
      trigger: "drawIngredientsTable",
    });

    const nameLines = doc.splitTextToSize(ingredient.name || "Unnamed ingredient", 74);
    const rowHeight = Math.max(7, nameLines.length * 3.4 + 4);
    y = ensurePageSpace(doc, y, rowHeight + 8, generatedTimestamp);

    if (index % 2 === 1) {
      doc.setFillColor(250, 250, 250);
      doc.rect(MARGIN, y, CONTENT_WIDTH, rowHeight, "F");
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(39, 39, 42);
    doc.text(nameLines, MARGIN + 2, y + 4.4);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.8);
    doc.setTextColor(63, 63, 70);
    doc.text(formatQuantity(ingredient.quantity), 101, y + 4.4, { align: "right" });
    doc.text(ingredient.unit || "-", 119, y + 4.4, { align: "right" });
    doc.text(formatUnitCostCell(ingredient.unitCost, ingredient.unit, unresolved), 146, y + 4.4, {
      align: "right",
    });

    doc.setFont("helvetica", "bold");
    doc.setTextColor(24, 24, 27);
    doc.text(formatMoney(ingredient.lineCost, unresolved), 173, y + 4.4, { align: "right" });

    doc.setFont("helvetica", "normal");
    doc.setTextColor(113, 113, 122);
    doc.text(
      formatContribution(ingredient.lineCost ?? 0, totalFoodCost, unresolved),
      rightEdge - 2,
      y + 4.4,
      {
        align: "right",
      },
    );

    doc.setDrawColor(228, 228, 231);
    doc.line(MARGIN, y + rowHeight, PAGE_WIDTH - MARGIN, y + rowHeight);
    y += rowHeight;
  });

  y = ensurePageSpace(doc, y, 10, generatedTimestamp);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(24, 24, 27);
  doc.text("Total food cost", 146, y + 6, { align: "right" });
  doc.text(formatMoney(totalFoodCost), 173, y + 6, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setTextColor(113, 113, 122);
  doc.text("100%", rightEdge - 2, y + 6, { align: "right" });

  return y + 10;
}

function drawOperationalNotes(
  doc: jsPDF,
  sheet: RecipeTechnicalSheet,
  startY: number,
  generatedTimestamp: string,
) {
  const notesText = sheet.notes?.trim();
  let y = ensurePageSpace(doc, startY, notesText ? 58 : 64, generatedTimestamp);

  y = drawLowerSectionTitle(doc, "Kitchen Notes", y, generatedTimestamp);

  if (notesText) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(63, 63, 70);
    y = writeWrappedText(doc, notesText, MARGIN, y, CONTENT_WIDTH, 4.2, generatedTimestamp);
    y += 6;
  }

  return reserveOpenWritingSpace(doc, y, notesText ? 32 : 52, generatedTimestamp);
}

function drawLowerSectionTitle(doc: jsPDF, title: string, y: number, generatedTimestamp: string) {
  y = ensurePageSpace(doc, y, 10, generatedTimestamp);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(24, 24, 27);
  doc.text(title, MARGIN, y);
  return y + 7;
}

function reserveOpenWritingSpace(
  doc: jsPDF,
  startY: number,
  height: number,
  generatedTimestamp: string,
) {
  const y = ensurePageSpace(doc, startY, height, generatedTimestamp);
  const guideCount = Math.max(3, Math.floor(height / 10));

  doc.setDrawColor(228, 228, 231);
  doc.setLineWidth(0.12);
  Array.from({ length: guideCount }).forEach((_, index) => {
    const lineY = y + 8 + index * 10;
    if (lineY < y + height - 2) {
      doc.line(MARGIN, lineY, PAGE_WIDTH - MARGIN, lineY);
    }
  });
  doc.setLineWidth(0.2);

  return y + height;
}

function ensurePageSpace(doc: jsPDF, y: number, requiredSpace: number, generatedTimestamp: string) {
  if (y + requiredSpace <= PAGE_HEIGHT - MARGIN - 8) return y;

  drawFooter(doc, generatedTimestamp);
  doc.addPage();
  return MARGIN;
}

function writeWrappedText(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  width: number,
  lineHeight: number,
  generatedTimestamp: string,
) {
  const lines = doc.splitTextToSize(text, width);
  lines.forEach((line: string) => {
    y = ensurePageSpace(doc, y, lineHeight + 4, generatedTimestamp);
    doc.text(line, x, y);
    y += lineHeight;
  });

  return y;
}

function drawFooter(doc: jsPDF, generatedTimestamp: string) {
  const pageCount = doc.getNumberOfPages();
  doc.setPage(pageCount);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(161, 161, 170);
  doc.text(`Marginly · Operational Recipe Intelligence - ${generatedTimestamp}`, MARGIN, FOOTER_Y);
  doc.text(`Page ${pageCount}`, PAGE_WIDTH - MARGIN, FOOTER_Y, { align: "right" });
}

function formatMoney(value: number | null, unresolved = false) {
  if (unresolved || isRecipeLineCostUnresolved(value)) {
    return "—";
  }
  const formatted = recipeLineCostDisplayCell(value).replace("€", "EUR ");
  return formatted.startsWith("EUR ") ? formatted : `EUR ${formatted}`;
}

function formatUnitCostCell(
  value: number | null,
  usageUnit: string | null | undefined,
  unresolved = false,
) {
  if (unresolved || value == null || !Number.isFinite(value)) {
    return "—";
  }
  const label = formatDisplayUnitCostForContext(value, usageUnit);
  return label.replace("€", "EUR ").replace("/", " / ");
}

function formatQuantity(value: number) {
  return Number(value || 0).toLocaleString(undefined, {
    maximumFractionDigits: 3,
  });
}

function formatContribution(lineCost: number, totalFoodCost: number, unresolved = false) {
  if (unresolved) return "-";
  if (totalFoodCost <= 0) return "-";
  const contribution = (Number(lineCost || 0) / totalFoodCost) * 100;
  if (contribution > 0 && contribution < 1) return "<1%";
  return `${contribution.toFixed(1)}%`;
}

function cleanMetadataValue(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "-";
}

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "recipe";
}
