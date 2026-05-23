import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { daysSinceRecency } from "@/lib/ingredient-pricing-freshness";
import type { IngredientCanonicalInput } from "@/lib/ingredient-canonical";
import type { Database } from "@/integrations/supabase/types";

type ArchiveClient = SupabaseClient<Database>;

export type OperationallyArchivedIngredient = IngredientCanonicalInput & {
  archived_at?: string | null;
};

/** Archived by user/orphan flow — not merged into another canonical. */
export function isOperationallyArchivedEntry(entry: {
  is_archived?: boolean | null;
  merged_into_ingredient_id?: string | null;
}): boolean {
  return entry.is_archived === true && !entry.merged_into_ingredient_id?.trim();
}

export function filterOperationallyArchivedIngredients<T extends IngredientCanonicalInput>(
  catalog: T[],
): T[] {
  return catalog.filter((entry) => isOperationallyArchivedEntry(entry));
}

/** Newest operational archives first; name tie-breaker when `archived_at` is missing. */
export function sortOperationallyArchivedIngredients<T extends OperationallyArchivedIngredient>(
  catalog: T[],
): T[] {
  return [...catalog].sort((a, b) => {
    const aTime = a.archived_at ? new Date(a.archived_at).getTime() : 0;
    const bTime = b.archived_at ? new Date(b.archived_at).getTime() : 0;
    if (aTime !== bTime) return bTime - aTime;
    return (a.name ?? "").localeCompare(b.name ?? "", undefined, { sensitivity: "base" });
  });
}

export type IngredientArchiveReason = "unused" | "manual" | "catalog_review";

const ARCHIVE_REASON_STORAGE_PREFIX = "marginly:archive-reason:";

function archiveReasonStorageKey(userId: string): string {
  return `${ARCHIVE_REASON_STORAGE_PREFIX}${userId.trim()}`;
}

function readArchiveReasonMap(userId: string): Record<string, IngredientArchiveReason> {
  if (typeof window === "undefined" || !userId.trim()) return {};
  try {
    const raw = window.localStorage.getItem(archiveReasonStorageKey(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Record<string, IngredientArchiveReason>;
  } catch {
    return {};
  }
}

function writeArchiveReasonMap(userId: string, map: Record<string, IngredientArchiveReason>): void {
  if (typeof window === "undefined" || !userId.trim()) return;
  try {
    window.localStorage.setItem(archiveReasonStorageKey(userId), JSON.stringify(map));
  } catch {
    // ignore quota / private mode
  }
}

export function setIngredientArchiveReason(
  userId: string,
  ingredientId: string,
  reason: IngredientArchiveReason,
): void {
  const uid = userId.trim();
  const id = ingredientId.trim();
  if (!uid || !id) return;
  const map = readArchiveReasonMap(uid);
  map[id] = reason;
  writeArchiveReasonMap(uid, map);
}

export function getIngredientArchiveReason(
  userId: string,
  ingredientId: string,
): IngredientArchiveReason | null {
  const id = ingredientId.trim();
  if (!id) return null;
  return readArchiveReasonMap(userId)[id] ?? null;
}

export function clearIngredientArchiveReason(userId: string, ingredientId: string): void {
  const uid = userId.trim();
  const id = ingredientId.trim();
  if (!uid || !id) return;
  const map = readArchiveReasonMap(uid);
  if (!(id in map)) return;
  delete map[id];
  writeArchiveReasonMap(uid, map);
}

export function formatIngredientArchiveReasonLine(
  reason: IngredientArchiveReason | null | undefined,
): string {
  switch (reason) {
    case "unused":
      return "Archived because unused";
    case "catalog_review":
      return "Archived from catalog review";
    default:
      return "Archived manually";
  }
}

/** Short label for archived list rows, e.g. "Archived 12 May". */
export function formatArchivedDateLabel(archivedAt: string | null | undefined): string {
  if (!archivedAt?.trim()) return "Archived";
  const parsed = new Date(archivedAt);
  if (Number.isNaN(parsed.getTime())) return "Archived";
  const day = parsed.getDate();
  const month = parsed.toLocaleDateString("en-GB", { month: "short" });
  return `Archived ${day} ${month}`;
}

export function formatArchivedRecency(archivedAt: string | null | undefined): string {
  const days = daysSinceRecency(archivedAt);
  if (days == null) return "Archived";
  if (days === 0) return "Archived today";
  if (days === 1) return "Archived yesterday";
  if (days < 14) return `Archived ${days} days ago`;
  if (days < 60) {
    const weeks = Math.floor(days / 7);
    return `Archived ${weeks} ${weeks === 1 ? "week" : "weeks"} ago`;
  }
  const months = Math.floor(days / 30);
  if (months < 12) {
    return `Archived ${months} ${months === 1 ? "month" : "months"} ago`;
  }
  const parsed = new Date(archivedAt!);
  if (Number.isNaN(parsed.getTime())) return "Archived";
  return `Archived ${parsed.toLocaleDateString("pt-PT", { month: "short", year: "numeric" })}`;
}

export function formatLastPurchaseRecencyPhrase(
  lastPurchaseAt: string | null | undefined,
): string | null {
  const days = daysSinceRecency(lastPurchaseAt);
  if (days == null) return null;
  if (days === 0) return "Last purchase today";
  if (days === 1) return "Last purchase yesterday";
  if (days < 14) return `Last purchase ${days} days ago`;
  if (days < 60) {
    const weeks = Math.floor(days / 7);
    return `Last purchase ${weeks} ${weeks === 1 ? "week" : "weeks"} ago`;
  }
  const months = Math.floor(days / 30);
  if (months < 12) {
    return `Last purchase ${months} ${months === 1 ? "month" : "months"} ago`;
  }
  const parsed = new Date(lastPurchaseAt!);
  if (Number.isNaN(parsed.getTime())) return null;
  return `Last purchase ${parsed.toLocaleDateString("pt-PT", { month: "short", year: "numeric" })}`;
}

const ARCHIVED_SELECT_BASE =
  "id, name, normalized_name, unit, is_archived, merged_into_ingredient_id";
const ARCHIVED_SELECT_WITH_TIMESTAMP = `${ARCHIVED_SELECT_BASE}, archived_at`;

function buildArchivedSelect(extraColumns: string, includeArchivedAt: boolean): string {
  const base = includeArchivedAt ? ARCHIVED_SELECT_WITH_TIMESTAMP : ARCHIVED_SELECT_BASE;
  return extraColumns ? `${base}, ${extraColumns}` : base;
}

/**
 * Operationally archived ingredients (excludes merge-absorbed duplicates).
 */
export async function loadArchivedIngredientCatalog(
  client: ArchiveClient,
  extraColumns = "",
): Promise<{ rows: OperationallyArchivedIngredient[]; error: string | null }> {
  const runQuery = (includeArchivedAt: boolean) => {
    const select = buildArchivedSelect(extraColumns, includeArchivedAt);
    let query = client
      .from("ingredients")
      .select(select)
      .eq("is_archived", true)
      .is("merged_into_ingredient_id", null);
    if (includeArchivedAt) {
      query = query.order("archived_at", { ascending: false, nullsFirst: false });
    } else {
      query = query.order("name", { ascending: true });
    }
    return query;
  };

  let { data, error } = await runQuery(true);
  if (error?.message?.includes("archived_at")) {
    ({ data, error } = await runQuery(false));
  }
  if (error) return { rows: [], error: error.message };

  const rows = filterOperationallyArchivedIngredients(
    (data ?? []) as OperationallyArchivedIngredient[],
  );
  return { rows, error: null };
}

export type ArchiveIngredientParams = {
  client: ArchiveClient;
  ingredientId: string;
  userId: string;
};

export type ArchiveIngredientResult = {
  error: PostgrestError | null;
};

export async function archiveIngredient(
  params: ArchiveIngredientParams,
): Promise<ArchiveIngredientResult> {
  const ingredientId = params.ingredientId?.trim();
  const userId = params.userId?.trim();
  if (!ingredientId || !userId) {
    return { error: null };
  }

  const archivedAt = new Date().toISOString();
  const withTimestamp = {
    is_archived: true,
    archived_at: archivedAt,
  };
  const archiveOnly = { is_archived: true };

  let result = await params.client
    .from("ingredients")
    .update(withTimestamp)
    .eq("user_id", userId)
    .eq("id", ingredientId)
    .is("merged_into_ingredient_id", null)
    .select("id");

  if (result.error?.message?.includes("archived_at")) {
    result = await params.client
      .from("ingredients")
      .update(archiveOnly)
      .eq("user_id", userId)
      .eq("id", ingredientId)
      .is("merged_into_ingredient_id", null)
      .select("id");
  }

  if (result.error) return { error: result.error };
  if (!result.data?.length) {
    return {
      error: {
        message: "Ingredient not found or cannot be archived",
        details: "",
        hint: "",
        code: "PGRST116",
      } as PostgrestError,
    };
  }

  return { error: null };
}

export type RestoreIngredientParams = {
  client: ArchiveClient;
  ingredientId: string;
  userId: string;
};

export type RestoreIngredientResult = {
  error: PostgrestError | null;
};

export async function restoreIngredient(
  params: RestoreIngredientParams,
): Promise<RestoreIngredientResult> {
  const ingredientId = params.ingredientId?.trim();
  const userId = params.userId?.trim();
  if (!ingredientId || !userId) {
    return { error: null };
  }

  const withTimestamp = {
    is_archived: false,
    archived_at: null,
  };
  const restoreOnly = { is_archived: false };

  let result = await params.client
    .from("ingredients")
    .update(withTimestamp)
    .eq("user_id", userId)
    .eq("id", ingredientId)
    .is("merged_into_ingredient_id", null)
    .select("id");

  if (result.error?.message?.includes("archived_at")) {
    result = await params.client
      .from("ingredients")
      .update(restoreOnly)
      .eq("user_id", userId)
      .eq("id", ingredientId)
      .is("merged_into_ingredient_id", null)
      .select("id");
  }

  if (result.error) return { error: result.error };
  if (!result.data?.length) {
    return {
      error: {
        message: "Ingredient not found or cannot be restored",
        details: "",
        hint: "",
        code: "PGRST116",
      } as PostgrestError,
    };
  }

  return { error: null };
}
