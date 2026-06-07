import type { AppSupabaseClient } from "@/lib/ingredient-alias-memory";
import type { IngredientAliasMap, IngredientCanonicalInput } from "@/lib/ingredient-canonical";
import { buildInvoiceMatchCatalog } from "@/lib/ingredient-canonical-synthesis";
import {
  buildCanonicalIngredientCreateDefaults,
  buildExplicitCanonicalInsertPayload,
  traceCanonicalConfirmedName,
  traceCanonicalCreate,
  traceCanonicalCreateFailure,
  type CanonicalIngredientCreateFormDefaults,
  validateCanonicalIngredientName,
} from "@/lib/canonical-ingredient-create";
import type { CanonicalIngredientCreateSubmitValues } from "@/components/canonical-ingredient-create-dialog";
import {
  invoiceRowMatchSummaryBucket,
  resolveInvoiceTableRowIngredientMatch,
} from "@/lib/invoice-ingredient-row-display";
import { normalizeInvoiceItemFields } from "@/lib/invoice-item-fields";
import {
  isEligibleInvoiceIngredientRow,
  type InvoiceUnresolvedIngredientCountInput,
} from "@/lib/invoice-unresolved-ingredient-count";
import {
  defaultIsGenericUnit,
  persistIngredientFromInvoiceItem,
  type AutoPersistCatalogEntry,
  type AutoPersistInvoiceItem,
} from "@/lib/ingredient-auto-persist";
import { guardIngredientCreation } from "@/lib/ingredient-operational-identity";
import {
  getAliasTraceCompareBucket,
  traceIngredientAliases,
  traceIngredientAliasesCatch,
} from "@/lib/ingredient-aliases-trace";
import { traceCanonicalCreateAttempt } from "@/lib/ingredient-catalog-diagnostics";

export type CanonicalIngredientCreateRowContext = {
  item: AutoPersistInvoiceItem;
  supplierName: string | null;
  invoiceId: string;
};

export type BulkCanonicalCreateCandidate = {
  item: AutoPersistInvoiceItem;
  defaults: CanonicalIngredientCreateFormDefaults;
};

export type SaveCanonicalIngredientFromInvoiceRowDeps = {
  supabase: AppSupabaseClient;
  userId: string;
  catalog: readonly AutoPersistCatalogEntry[];
  isGenericUnit?: (unit: string | null | undefined) => boolean;
  persistIngredientCorrection: (
    item: AutoPersistInvoiceItem,
    ingredientId: string,
    ingredientName: string,
    invoiceId: string,
    supplierName?: string | null,
  ) => Promise<{ ok: boolean; error?: string }>;
};

export type SaveCanonicalIngredientFromInvoiceRowResult =
  | {
      ok: true;
      ingredientId: string;
      ingredientName: string;
      ingredientReused: boolean;
      catalogRow: AutoPersistCatalogEntry;
    }
  | { ok: false; error: string; blockReason?: string };

export type BulkCanonicalCreateRowInput = {
  context: CanonicalIngredientCreateRowContext;
  values: CanonicalIngredientCreateSubmitValues;
};

export type BulkCanonicalCreateRowOutcome = {
  itemId: string;
  invoiceAlias: string;
  result: SaveCanonicalIngredientFromInvoiceRowResult;
};

export type ExecuteBulkCanonicalIngredientCreateResult = {
  outcomes: BulkCanonicalCreateRowOutcome[];
  succeeded: number;
  failed: number;
};

function isEligibleForExplicitCanonicalCreate(name: string): boolean {
  const normalized = name.trim().toLowerCase();
  return normalized.length > 0 && normalized !== "unknown";
}

/** Collect unmatched invoice rows eligible for explicit_user canonical create. */
export function collectUnmatchedRowsForBulkCreate(params: {
  items: readonly InvoiceUnresolvedIngredientCountInput[];
  ingredientCatalog: readonly IngredientCanonicalInput[];
  confirmedAliases?: IngredientAliasMap;
  supplierName?: string | null;
  isGenericUnit?: (unit: string | null | undefined) => boolean;
}): BulkCanonicalCreateCandidate[] {
  const isGenericUnit = params.isGenericUnit ?? defaultIsGenericUnit;
  const eligibleItems = params.items
    .map((item) => normalizeInvoiceItemFields(item))
    .filter(isEligibleInvoiceIngredientRow)
    .filter((item) => isEligibleForExplicitCanonicalCreate(item.name));

  if (eligibleItems.length === 0) return [];

  const matchCatalog = buildInvoiceMatchCatalog(
    [...params.ingredientCatalog],
    eligibleItems.map((item) => ({ name: item.name })),
  );

  const candidates: BulkCanonicalCreateCandidate[] = [];
  for (const item of eligibleItems) {
    const { state } = resolveInvoiceTableRowIngredientMatch(
      item.name,
      matchCatalog,
      params.confirmedAliases ?? {},
      params.supplierName,
    );
    if (invoiceRowMatchSummaryBucket(state.displayState) !== "unmatched") continue;
    candidates.push({
      item,
      defaults: buildCanonicalIngredientCreateDefaults(item, {
        supplierName: params.supplierName,
        isGenericUnit,
      }),
    });
  }
  return candidates;
}

function blockReasonToUserMessage(blockReason?: string): string {
  if (blockReason === "archived_ingredient_resurrection") {
    return "This name was merged/archived. Use the canonical ingredient instead.";
  }
  if (blockReason === "invoice_shorthand_not_canonical") {
    return "Use a full product name for the catalog. Invoice shorthand belongs in alias memory.";
  }
  return "Could not create ingredient from this invoice line.";
}

/** Shared core for single-row and bulk explicit_user canonical create from invoice lines. */
export async function saveCanonicalIngredientFromInvoiceRow(
  deps: SaveCanonicalIngredientFromInvoiceRowDeps,
  context: CanonicalIngredientCreateRowContext,
  values: CanonicalIngredientCreateSubmitValues,
): Promise<SaveCanonicalIngredientFromInvoiceRowResult> {
  const { item, supplierName, invoiceId } = context;
  const isGenericUnit = deps.isGenericUnit ?? defaultIsGenericUnit;

  traceIngredientAliases("saveCanonicalIngredientFromInvoiceRow:enter", {
    function: "saveCanonicalIngredientFromInvoiceRow",
    itemId: item.id,
    invoiceAlias: item.name,
    compareBucket: getAliasTraceCompareBucket(item.name),
    canonicalName: values.canonicalName,
    supplierName,
  });
  traceCanonicalCreateAttempt({
    flowFunction: "saveCanonicalIngredientFromInvoiceRow",
    flowOrigin: "explicit_user",
    stage: "submit",
    rawInvoiceText: item.name,
    normalized: values.canonicalName,
    finalCanonicalName: values.canonicalName,
    nameSource: "user_canonical",
    insertAttempted: false,
  });

  const nameValidation = validateCanonicalIngredientName(values.canonicalName, {
    invoiceAlias: item.name,
  });
  if (!nameValidation.ok) {
    traceIngredientAliases("saveCanonicalIngredientFromInvoiceRow:early-return", {
      branch: "canonical_name_validation_failed",
      invoiceAlias: item.name,
      message: nameValidation.message,
    });
    return { ok: false, error: nameValidation.message };
  }

  traceCanonicalConfirmedName({ confirmedName: values.canonicalName.trim() });

  const payload = buildExplicitCanonicalInsertPayload({
    canonicalName: values.canonicalName,
    item,
    userId: deps.userId,
    unit: values.unit,
    current_price: values.current_price,
    purchase_quantity: values.purchase_quantity,
    purchase_unit: values.purchase_unit,
    base_unit: values.base_unit,
    isGenericUnit,
  });
  if (!payload) {
    traceIngredientAliases("saveCanonicalIngredientFromInvoiceRow:early-return", {
      branch: "buildExplicitCanonicalInsertPayload_null",
      invoiceAlias: item.name,
    });
    return { ok: false, error: "Could not build ingredient from this invoice line." };
  }

  traceCanonicalCreate("submit-start", {
    itemId: item.id,
    invoiceAlias: item.name,
    canonicalName: values.canonicalName,
    supplierName,
  });

  try {
    const guard = guardIngredientCreation(values.canonicalName, [...deps.catalog], {
      flowFunction: "saveCanonicalIngredientFromInvoiceRow",
      flowOrigin: "explicit_user",
      rawInvoiceText: item.name,
    });
    let ingredientId: string;
    let ingredientName: string;
    let ingredientReused = false;
    let catalogRow: AutoPersistCatalogEntry;

    traceCanonicalCreate("guard-resolved", {
      action: guard.action,
      operationalKey: guard.operationalKey,
      existingId: guard.action === "reuse" ? guard.existing.id : null,
      reason: guard.action === "reuse" ? guard.reason : null,
    });

    if (guard.action === "reuse") {
      ingredientReused = true;
      ingredientId = guard.existing.id;
      ingredientName =
        guard.existing.name ?? guard.existing.normalized_name ?? values.canonicalName;
      catalogRow = guard.existing;
      traceCanonicalCreate("ingredient-reuse", {
        ingredientId,
        ingredientName,
        reason: guard.reason,
        proposedCanonicalName: values.canonicalName,
      });
    } else {
      const { data, error, blocked, blockReason } = await persistIngredientFromInvoiceItem(
        deps.supabase,
        payload,
        {
          catalog: [...deps.catalog],
          source: "explicit_user",
        },
      );
      if (error) throw error;
      if (blocked) {
        traceCanonicalCreateFailure("ingredient-blocked", {
          blockReason,
          canonicalName: values.canonicalName,
        });
        return { ok: false, error: blockReasonToUserMessage(blockReason), blockReason };
      }
      if (!data?.id) {
        traceCanonicalCreateFailure("ingredient-missing-id", {
          canonicalName: values.canonicalName,
        });
        return { ok: false, error: "Could not create ingredient." };
      }
      ingredientId = data.id;
      ingredientName = data.name ?? values.canonicalName;
      catalogRow = data;
      traceCanonicalCreate("ingredient-create-ok", {
        ingredientId,
        ingredientName,
        normalizedName: data.normalized_name,
      });
    }

    traceIngredientAliases("saveCanonicalIngredientFromInvoiceRow:alias-persist-call", {
      invoiceAlias: item.name,
      ingredientId,
      ingredientReused,
    });
    const aliasResult = await deps.persistIngredientCorrection(
      item,
      ingredientId,
      ingredientName,
      invoiceId,
      supplierName,
    );
    if (!aliasResult.ok) {
      traceIngredientAliases("saveCanonicalIngredientFromInvoiceRow:alias-failed", {
        invoiceAlias: item.name,
        error: aliasResult.error,
        insertAttempted: true,
      });
      traceCanonicalCreateFailure("alias-link-failed", {
        itemId: item.id,
        invoiceAlias: item.name,
        ingredientId,
        ingredientReused,
        error: aliasResult.error,
      });
      return {
        ok: false,
        error:
          aliasResult.error ??
          "Ingredient saved but invoice alias could not be linked. Try choosing the ingredient manually.",
      };
    }

    traceCanonicalCreate("complete", {
      itemId: item.id,
      invoiceAlias: item.name,
      ingredientId,
      ingredientReused,
    });
    return {
      ok: true,
      ingredientId,
      ingredientName,
      ingredientReused,
      catalogRow,
    };
  } catch (err) {
    traceIngredientAliasesCatch("saveCanonicalIngredientFromInvoiceRow", err, {
      invoiceAlias: item.name,
    });
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not create ingredient.",
    };
  }
}

/** Run explicit_user creates sequentially so alias queue and catalog updates stay ordered. */
export async function executeBulkCanonicalIngredientCreate(
  deps: SaveCanonicalIngredientFromInvoiceRowDeps & {
    onCatalogRow?: (row: AutoPersistCatalogEntry) => void;
    onRowComplete?: (outcome: BulkCanonicalCreateRowOutcome) => void;
  },
  rows: readonly BulkCanonicalCreateRowInput[],
): Promise<ExecuteBulkCanonicalIngredientCreateResult> {
  const outcomes: BulkCanonicalCreateRowOutcome[] = [];
  let catalog = [...deps.catalog];
  let succeeded = 0;
  let failed = 0;

  for (const row of rows) {
    const result = await saveCanonicalIngredientFromInvoiceRow(
      { ...deps, catalog },
      row.context,
      row.values,
    );
    const outcome: BulkCanonicalCreateRowOutcome = {
      itemId: row.context.item.id,
      invoiceAlias: row.context.item.name,
      result,
    };
    outcomes.push(outcome);
    deps.onRowComplete?.(outcome);

    if (result.ok) {
      succeeded += 1;
      if (!catalog.some((entry) => entry.id === result.catalogRow.id)) {
        catalog = [...catalog, result.catalogRow];
      }
      deps.onCatalogRow?.(result.catalogRow);
    } else {
      failed += 1;
    }
  }

  return { outcomes, succeeded, failed };
}

export function buildBulkSubmitValuesFromDefaults(
  defaults: CanonicalIngredientCreateFormDefaults,
  canonicalName: string,
): CanonicalIngredientCreateSubmitValues {
  const pq = Number(defaults.purchase_quantity);
  const purchase_quantity = Number.isFinite(pq) && pq > 0 ? pq : 1;
  const current_price = Number(defaults.current_price);
  return {
    canonicalName: canonicalName.trim(),
    unit: defaults.unit.trim() || "kg",
    purchase_quantity,
    purchase_unit: defaults.purchase_unit.trim() || null,
    base_unit: defaults.base_unit.trim() || defaults.unit.trim() || "kg",
    current_price: Number.isFinite(current_price) && current_price >= 0 ? current_price : 0,
  };
}
