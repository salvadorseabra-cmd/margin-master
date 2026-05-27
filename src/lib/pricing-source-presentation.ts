import { formatDisplayUnitCost } from "@/lib/display-unit-cost";
import type { IngredientLatestPurchaseGlance } from "@/lib/ingredient-operational-intelligence";
import { inferIngredientCostBaseUnit, type IngredientCostFields } from "@/lib/ingredient-unit-cost";
import type { PricingConfidence } from "@/lib/pricing-trace";
import type { OperationalIngredientCostSource } from "@/lib/resolve-operational-ingredient-cost";
import type { BaseUnit } from "@/lib/recipe-unit-normalization";
import { normalizeSupplierDisplayName } from "@/lib/supplier-identity";

/** Invoice overlay + resolver date + optional purchase glance (recipe workspace metadata only). */
export type IngredientPriceProvenanceInput = {
  supplierLabel?: string | null;
  chosenDate?: string | null;
  invoiceDateIso?: string | null;
  purchaseGlance?: Pick<IngredientLatestPurchaseGlance, "supplierLabel" | "lastPurchaseAt"> | null;
};

/** Supplier + invoice date for display — independent of operational pricing source. */
export function resolveIngredientPriceProvenanceFields(
  input: IngredientPriceProvenanceInput,
): { supplier: string | null; date: string | null } {
  const supplier =
    input.supplierLabel?.trim() || input.purchaseGlance?.supplierLabel?.trim() || null;
  const date =
    input.chosenDate?.trim() ||
    input.invoiceDateIso?.trim() ||
    input.purchaseGlance?.lastPurchaseAt?.trim() ||
    null;
  return { supplier, date };
}

export function hasIngredientPriceProvenance(
  provenance: Pick<IngredientPriceProvenanceInput, "supplierLabel" | "chosenDate" | "invoiceDateIso" | "purchaseGlance">,
): boolean {
  const { supplier, date } = resolveIngredientPriceProvenanceFields(provenance);
  return Boolean(supplier || date);
}

export type OperationalPriceContext = {
  supplier: string | null;
  invoiceDate: string | null;
  originalPriceLabel: string | null;
  /** Human resolution label (e.g. Latest invoice). */
  debugMethod?: string | null;
};

export type FormatOperationalPriceContextInput = {
  /** Resolver confidence code or operational source bucket. */
  source: PricingConfidence | OperationalIngredientCostSource;
  supplier?: string | null;
  /** ISO `YYYY-MM-DD` or parseable purchase date label. */
  date?: string | null;
  unitCostEur?: number | null;
  costFields?: IngredientCostFields | null;
  /** For technical trace line only (internal base unit). */
  costSource?: OperationalIngredientCostSource | null;
  costBaseUnit?: BaseUnit | null;
};

export type FormattedOperationalPriceContext = {
  context: OperationalPriceContext;
  /** Labeled lines for recipe rows and detail panels (supplier + invoice only). */
  primaryLines: string[];
  /** One-line picker subtitle (supplier + invoice date only). */
  compactLine: string | null;
  /** Collapsible / trace-only lines (resolution, original price, resolver codes). */
  technicalDetailLines: string[];
  /** Raw resolver diagnostic for trace logging. */
  debugTechnicalLine: string | null;
  /** Raw confidence / source code for trace logging. */
  debugResolutionCode: string | null;
};

export type IngredientPriceMetadataHierarchy = {
  secondaryLine: string | null;
  tertiaryLine: string | null;
};

/** Inline technical metadata when `window.__MARGINLY_PRICING_TRACE__` is set. */
export function shouldShowPricingSourceDebug(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as Window & { __MARGINLY_PRICING_TRACE__?: boolean };
  return w.__MARGINLY_PRICING_TRACE__ === true;
}

export function formatOperationalInvoiceDate(
  isoOrLabel: string | null | undefined,
): string | null {
  const trimmed = isoOrLabel?.trim();
  if (!trimmed) return null;

  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const parsed = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 12, 0, 0);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    }
  }

  const parsed = Date.parse(trimmed);
  if (!Number.isNaN(parsed)) {
    return new Date(parsed).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }

  return trimmed;
}

export function pricingConfidenceHumanLabel(
  source: PricingConfidence | OperationalIngredientCostSource,
): string {
  switch (source) {
    case "invoice_direct":
    case "invoice":
      return "Latest invoice";
    case "invoice_converted":
      return "Latest invoice (converted)";
    case "catalog_fallback":
    case "catalog":
      return "Catalog price";
    case "stale_price":
    case "embed":
      return "Saved recipe price";
    case "unit_mismatch":
      return "Unit mismatch";
    case "missing":
      return "Price missing";
    default:
      return "Catalog price";
  }
}

function normalizeResolutionCode(
  source: PricingConfidence | OperationalIngredientCostSource,
): string {
  if (source === "invoice") return "invoice_direct";
  if (source === "catalog") return "catalog_fallback";
  if (source === "embed") return "stale_price";
  if (source === "missing") return "catalog_fallback";
  return source;
}

export function buildOperationalPriceContext(
  input: FormatOperationalPriceContextInput,
): OperationalPriceContext {
  const supplierRaw = input.supplier?.trim();
  const supplier = supplierRaw
    ? normalizeSupplierDisplayName(supplierRaw) || supplierRaw
    : null;
  const invoiceDate = formatOperationalInvoiceDate(input.date);

  let originalPriceLabel: string | null = null;
  if (input.unitCostEur != null && Number.isFinite(input.unitCostEur) && input.costFields) {
    const base =
      input.costBaseUnit ?? inferIngredientCostBaseUnit(input.costFields);
    originalPriceLabel = formatDisplayUnitCost(input.unitCostEur, base).formattedLabel;
  }

  const debugMethod = pricingConfidenceHumanLabel(input.source);

  return {
    supplier,
    invoiceDate,
    originalPriceLabel,
    debugMethod,
  };
}

function labeledLine(label: string, value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return `${label}: ${trimmed}`;
}

export function formatOperationalPriceContextPrimaryLines(
  context: OperationalPriceContext,
): string[] {
  return [labeledLine("Supplier", context.supplier), labeledLine("Invoice", context.invoiceDate)].filter(
    (line): line is string => Boolean(line),
  );
}

export function formatOperationalPriceContextCompactLine(
  context: OperationalPriceContext,
): string | null {
  const parts = [context.supplier, context.invoiceDate].filter((part): part is string =>
    Boolean(part?.trim()),
  );
  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * Shared ingredient-row metadata hierarchy:
 * - secondary: pricing provenance (supplier + invoice date)
 * - tertiary: optional packaged-liquid pack context
 */
export function formatIngredientPriceMetadataHierarchy(input: {
  provenanceLine?: string | null;
  packagedPackLine?: string | null;
}): IngredientPriceMetadataHierarchy {
  const provenanceLine = input.provenanceLine?.trim() || null;
  const packagedPackLine = input.packagedPackLine?.trim() || null;
  return {
    secondaryLine: provenanceLine ?? packagedPackLine,
    tertiaryLine: provenanceLine ? packagedPackLine : null,
  };
}

/** PDF ingredient row footnote (supplier + invoice date only). */
export function formatOperationalPricePdfFootnote(
  context: OperationalPriceContext,
): string | null {
  return formatOperationalPriceContextCompactLine(context);
}

export function formatOperationalPriceContextTechnicalLines(input: {
  context: OperationalPriceContext;
  debugResolutionCode: string;
  debugTechnicalLine: string | null;
}): string[] {
  const lines: string[] = [];
  if (input.context.debugMethod?.trim()) {
    lines.push(`Resolution: ${input.context.debugMethod.trim()}`);
  }
  if (input.context.originalPriceLabel?.trim()) {
    lines.push(`Original price: ${input.context.originalPriceLabel.trim()}`);
  }
  if (input.debugResolutionCode.trim()) {
    lines.push(`Resolver: ${input.debugResolutionCode.trim()}`);
  }
  if (input.debugTechnicalLine?.trim()) {
    lines.push(input.debugTechnicalLine.trim());
  }
  return lines;
}

export function formatPricingDebugTechnicalLine(input: {
  costSource?: OperationalIngredientCostSource | null;
  costBaseUnit?: BaseUnit | null;
  resolutionCode: string;
  invoiceDateIso?: string | null;
}): string | null {
  const source = input.costSource?.trim();
  const base = input.costBaseUnit?.trim();
  const code = input.resolutionCode.trim();
  const date = input.invoiceDateIso?.trim();
  const parts = [source, base, code, date].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function formatOperationalPriceContext(
  input: FormatOperationalPriceContextInput,
): FormattedOperationalPriceContext {
  const context = buildOperationalPriceContext(input);
  const primaryLines = formatOperationalPriceContextPrimaryLines(context);
  const compactLine = formatOperationalPriceContextCompactLine(context);
  const debugResolutionCode = normalizeResolutionCode(input.source);
  const debugTechnicalLine = formatPricingDebugTechnicalLine({
    costSource: input.costSource ?? null,
    costBaseUnit: input.costBaseUnit ?? null,
    resolutionCode: debugResolutionCode,
    invoiceDateIso: input.date ?? null,
  });
  const technicalDetailLines = formatOperationalPriceContextTechnicalLines({
    context,
    debugResolutionCode,
    debugTechnicalLine,
  });

  return {
    context,
    primaryLines,
    compactLine,
    technicalDetailLines,
    debugTechnicalLine,
    debugResolutionCode,
  };
}
