import type { IngredientAliasMap } from "@/lib/ingredient-canonical";
import { traceManualMatchCacheState } from "@/lib/alias-state-trace";

export type IngredientAliasPersistQueue = {
  /** Run alias read-modify-write work serially to avoid last-write-wins map loss. */
  enqueue: <T>(task: () => Promise<T>) => Promise<T>;
  getGeneration: () => number;
};

/**
 * Serializes confirmed-alias persist handlers that share one in-memory map.
 */
export function createIngredientAliasPersistQueue(): IngredientAliasPersistQueue {
  let tail: Promise<void> = Promise.resolve();
  let generation = 0;

  const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
    const jobGeneration = ++generation;
    traceManualMatchCacheState({
      event: "enqueue",
      queueGeneration: jobGeneration,
      pendingDepth: generation,
    });

    const run = (): Promise<T> =>
      task().finally(() => {
        traceManualMatchCacheState({
          event: "dequeue_complete",
          queueGeneration: jobGeneration,
        });
      });

    const result = tail.then(run, run);
    tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };

  return {
    enqueue,
    getGeneration: () => generation,
  };
}

/** Merge DB reload into session map; DB wins on key collision. */
export function mergeConfirmedAliasMapsAfterReload(
  sessionMap: IngredientAliasMap,
  dbMap: IngredientAliasMap,
): IngredientAliasMap {
  return { ...sessionMap, ...dbMap };
}
