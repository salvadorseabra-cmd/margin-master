const NUMBER_FORMATTERS = new Map<string, Intl.NumberFormat>();

type SignDisplay = "auto" | "always" | "exceptZero" | "negative" | "never";

function formatter(minimumFractionDigits: number, maximumFractionDigits: number) {
  const key = `${minimumFractionDigits}:${maximumFractionDigits}`;
  const cached = NUMBER_FORMATTERS.get(key);
  if (cached) return cached;

  const next = new Intl.NumberFormat("en-US", {
    minimumFractionDigits,
    maximumFractionDigits,
  });
  NUMBER_FORMATTERS.set(key, next);
  return next;
}

function finiteNumber(value: number) {
  return Number.isFinite(value) ? value : 0;
}

function roundTo(value: number, fractionDigits: number) {
  const factor = 10 ** fractionDigits;
  return Math.round((finiteNumber(value) + Number.EPSILON) * factor) / factor;
}

function formatNumber(value: number, maximumFractionDigits: number, minimumFractionDigits = 0) {
  return formatter(minimumFractionDigits, maximumFractionDigits).format(
    roundTo(value, maximumFractionDigits),
  );
}

export function formatDecimal(value: number, maximumFractionDigits = 1) {
  return formatNumber(value, maximumFractionDigits);
}

export function formatCurrency(value: number) {
  return `€${formatNumber(value, 2, 2)}`;
}

export function formatUnitCostCurrency(value: number) {
  const safeValue = finiteNumber(value);
  const roundedToTwo = roundTo(safeValue, 2);
  if (Math.abs(safeValue - roundedToTwo) < 0.000_5) {
    return `€${formatNumber(safeValue, 2, 2)}`;
  }

  const roundedToThree = roundTo(safeValue, 3);
  if (Math.abs(safeValue - roundedToThree) < 0.000_05) {
    return `€${formatNumber(safeValue, 3, 3)}`;
  }

  return `€${formatNumber(safeValue, 4, 4)}`;
}

export function formatPercent(value: number, options: { signDisplay?: SignDisplay } = {}) {
  const formatted = formatNumber(Math.abs(value) < 0.05 ? 0 : value, 1);
  if (options.signDisplay === "always" && finiteNumber(value) > 0) {
    return `+${formatted}%`;
  }

  return `${formatted}%`;
}

export function formatQuantity(value: number, unit: string | null | undefined) {
  const normalizedUnit = unit?.trim().toLowerCase() ?? "";
  const maximumFractionDigits =
    normalizedUnit === "g" ||
    normalizedUnit === "gram" ||
    normalizedUnit === "grams" ||
    normalizedUnit === "ml" ||
    normalizedUnit === "milliliter" ||
    normalizedUnit === "milliliters"
      ? 1
      : normalizedUnit === "kg" ||
          normalizedUnit === "kilogram" ||
          normalizedUnit === "kilograms" ||
          normalizedUnit === "l" ||
          normalizedUnit === "liter" ||
          normalizedUnit === "liters" ||
          normalizedUnit === "litre" ||
          normalizedUnit === "litres"
        ? 2
        : 2;

  return formatNumber(value, maximumFractionDigits);
}

export function formatQuantityWithUnit(value: number, unit: string | null | undefined) {
  const unitLabel = unit?.trim();
  return unitLabel
    ? `${formatQuantity(value, unitLabel)} ${unitLabel}`
    : formatQuantity(value, unit);
}
