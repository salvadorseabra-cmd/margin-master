import { defaultIsGenericUnit } from "@/lib/ingredient-auto-persist";
import {
  computeEffectiveUsableCost,
  type InvoicePurchasePriceMetadata,
} from "@/lib/invoice-purchase-price-semantics";
import { resolveStructuredPurchaseForDisplay } from "@/lib/invoice-purchase-format";
import { buildValidationFinding } from "@/lib/invoice-validation/finding-id";
import type {
  InvoiceLineValidationInput,
  ValidationEvidence,
  ValidationFinding,
} from "@/lib/invoice-validation/types";

export const OPERATIONAL_NORMALIZATION_INCONSISTENCY_CODE =
  "OPERATIONAL_NORMALIZATION_INCONSISTENCY";
export const OPERATIONAL_ECONOMICS_VARIANCE_ABS_THRESHOLD_EUR = 0.5;
export const OPERATIONAL_ECONOMICS_VARIANCE_PCT_THRESHOLD = 10;
export const OPERATIONAL_PACK_WEIGHT_VARIANCE_KG_THRESHOLD = 0.5;
export const OPERATIONAL_PACK_WEIGHT_VARIANCE_PCT_THRESHOLD = 10;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeRowUnit(unit: string | null | undefined): string {
  return unit?.trim().toLowerCase() ?? "";
}

function hasFractionalQuantity(quantity: number): boolean {
  return Math.abs(quantity - Math.round(quantity)) > 0.001;
}

function exceedsOperationalVarianceThreshold(varianceAbs: number, variancePct: number): boolean {
  return (
    varianceAbs > OPERATIONAL_ECONOMICS_VARIANCE_ABS_THRESHOLD_EUR ||
    variancePct > OPERATIONAL_ECONOMICS_VARIANCE_PCT_THRESHOLD
  );
}

function resolveInvoiceImpliedUnitCost(
  total: number,
  quantity: number,
  rowUnit: string,
  operationalUnit: string,
): { cost: number; unit: string } | null {
  if (operationalUnit === "kg") {
    if (rowUnit === "kg") {
      return { cost: total / quantity, unit: "kg" };
    }
    if (defaultIsGenericUnit(rowUnit) && hasFractionalQuantity(quantity)) {
      return { cost: total / quantity, unit: "kg" };
    }
  }

  if (operationalUnit === "L" && (rowUnit === "l" || rowUnit === "lt")) {
    return { cost: total / quantity, unit: "L" };
  }

  return null;
}

function operationalCostUnit(operationalUnit: string): string {
  return operationalUnit === "L" ? "EUR/L" : "EUR/kg";
}

function detectDisplayOperationalMismatch(
  metadata: InvoicePurchasePriceMetadata,
  input: InvoiceLineValidationInput,
  total: number,
  quantity: number,
  rowUnit: string,
  name: string,
): ValidationFinding | null {
  const structured = resolveStructuredPurchaseForDisplay(metadata);
  const unitPrice = metadata.unit_price == null ? null : Number(metadata.unit_price);
  if (unitPrice == null || !Number.isFinite(unitPrice)) return null;

  const effective = computeEffectiveUsableCost(unitPrice, metadata, structured, name);
  if (effective == null || !Number.isFinite(effective.cost) || effective.cost <= 0) {
    return null;
  }

  const invoiceImplied = resolveInvoiceImpliedUnitCost(
    total,
    quantity,
    rowUnit,
    effective.unit,
  );
  if (invoiceImplied == null) return null;

  const varianceAbs = round2(Math.abs(invoiceImplied.cost - effective.cost));
  const denom = Math.max(invoiceImplied.cost, effective.cost, 0.01);
  const variancePct = round2((varianceAbs / denom) * 100);
  if (!exceedsOperationalVarianceThreshold(varianceAbs, variancePct)) return null;

  const costUnit = operationalCostUnit(effective.unit);

  const evidence: ValidationEvidence = {
    expected: {
      value: round2(invoiceImplied.cost),
      unit: costUnit,
      label: "Invoice operational cost",
    },
    actual: {
      value: round2(effective.cost),
      unit: costUnit,
      label: "Calculated operational cost",
    },
    difference: { absolute: varianceAbs, percent: variancePct },
    extra: {
      check: "display_operational_vs_invoice",
      line_total: round2(total),
      quantity,
      row_unit: rowUnit,
      pack_structure: {
        container_count: structured.purchaseContainerCount,
        container_unit: structured.purchaseContainerUnit,
        package_quantity: structured.packageQuantity,
        package_measurement_unit: structured.packageMeasurementUnit,
      },
      usable_quantity: structured.normalizedUsableQuantity,
      usable_quantity_unit: structured.usableQuantityUnit,
    },
  };

  return buildValidationFinding({
    invoiceItemId: input.id,
    severity: "warning",
    category: "operational",
    code: OPERATIONAL_NORMALIZATION_INCONSISTENCY_CODE,
    title: "Operational mismatch",
    description: "Normalized operational cost does not reconcile with invoice line economics.",
    evidence,
    suggestedAction: "Review pack structure and usable quantity normalization for this line.",
  });
}

/** Weight-priced generic rows where name pack total (qty=1) diverges from billed row qty. */
function detectPackStructureInvoiceWeightMismatch(
  metadata: InvoicePurchasePriceMetadata,
  input: InvoiceLineValidationInput,
  total: number,
  quantity: number,
  rowUnit: string,
): ValidationFinding | null {
  if (!defaultIsGenericUnit(rowUnit) || !hasFractionalQuantity(quantity)) return null;

  const nameStructure = resolveStructuredPurchaseForDisplay({
    ...metadata,
    quantity: 1,
  });
  if (
    nameStructure.usableQuantityUnit !== "g" ||
    nameStructure.normalizedUsableQuantity == null ||
    nameStructure.normalizedUsableQuantity <= 0
  ) {
    return null;
  }

  const structureKg = nameStructure.normalizedUsableQuantity / 1000;
  const purchasedKg = quantity;
  const packVarianceKg = Math.abs(structureKg - purchasedKg);
  const packVariancePct = round2((packVarianceKg / Math.max(purchasedKg, 0.01)) * 100);
  if (
    packVarianceKg <= OPERATIONAL_PACK_WEIGHT_VARIANCE_KG_THRESHOLD ||
    packVariancePct <= OPERATIONAL_PACK_WEIGHT_VARIANCE_PCT_THRESHOLD
  ) {
    return null;
  }

  const invoicePerKg = total / purchasedKg;
  const structurePerKg = total / structureKg;
  const varianceAbs = round2(Math.abs(invoicePerKg - structurePerKg));
  const denom = Math.max(invoicePerKg, structurePerKg, 0.01);
  const variancePct = round2((varianceAbs / denom) * 100);
  if (!exceedsOperationalVarianceThreshold(varianceAbs, variancePct)) return null;

  const evidence: ValidationEvidence = {
    expected: {
      value: round2(invoicePerKg),
      unit: "EUR/kg",
      label: "Invoice operational cost",
    },
    actual: {
      value: round2(structurePerKg),
      unit: "EUR/kg",
      label: "Calculated operational cost",
    },
    difference: { absolute: varianceAbs, percent: variancePct },
    extra: {
      check: "pack_structure_vs_row_weight",
      structure_usable_kg: round2(structureKg),
      purchased_weight_kg: round2(purchasedKg),
      line_total: round2(total),
      quantity,
      row_unit: rowUnit,
      pack_structure: {
        container_count: nameStructure.purchaseContainerCount,
        container_unit: nameStructure.purchaseContainerUnit,
        package_quantity: nameStructure.packageQuantity,
        package_measurement_unit: nameStructure.packageMeasurementUnit,
      },
      usable_quantity: nameStructure.normalizedUsableQuantity,
      usable_quantity_unit: nameStructure.usableQuantityUnit,
    },
  };

  return buildValidationFinding({
    invoiceItemId: input.id,
    severity: "warning",
    category: "operational",
    code: OPERATIONAL_NORMALIZATION_INCONSISTENCY_CODE,
    title: "Operational mismatch",
    description:
      "Pack structure normalization does not reconcile with invoice weight economics.",
    evidence,
    suggestedAction:
      "Confirm whether row quantity is billed weight or whether pack notation should scale usable stock.",
  });
}

export function validateOperationalFindings(input: InvoiceLineValidationInput): ValidationFinding[] {
  const total = input.total == null ? null : Number(input.total);
  const quantity = input.quantity == null ? null : Number(input.quantity);
  const unitPrice = input.unit_price == null ? null : Number(input.unit_price);

  if (
    total == null ||
    !Number.isFinite(total) ||
    quantity == null ||
    !Number.isFinite(quantity) ||
    quantity <= 0 ||
    unitPrice == null ||
    !Number.isFinite(unitPrice)
  ) {
    return [];
  }

  const metadata: InvoicePurchasePriceMetadata = {
    name: input.name,
    quantity: input.quantity,
    unit: input.unit,
    unit_price: input.unit_price,
    matchedIngredientName: input.matchedIngredientName ?? null,
  };
  const rowUnit = normalizeRowUnit(input.unit);

  const displayMismatch = detectDisplayOperationalMismatch(
    metadata,
    input,
    total,
    quantity,
    rowUnit,
    input.name,
  );
  if (displayMismatch) {
    return [displayMismatch];
  }

  const packMismatch = detectPackStructureInvoiceWeightMismatch(
    metadata,
    input,
    total,
    quantity,
    rowUnit,
  );
  return packMismatch ? [packMismatch] : [];
}
