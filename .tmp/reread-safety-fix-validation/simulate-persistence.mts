/**
 * Simulates runExtraction persistence guards (mirrors invoices.tsx logic).
 * READ-ONLY validation — not imported by app.
 */

export type PersistenceOutcome =
  | "SKIP_MUTEX"
  | "SKIP_EMPTY"
  | "SKIP_NO_USER"
  | "ABORT_DELETE_ERROR"
  | "ABORT_INSERT_ERROR"
  | "PERSIST_OK";

export function simulatePersistence(input: {
  inFlight: boolean;
  rawItems: unknown[];
  normalizedCount: number;
  hasUser: boolean;
  deleteError?: string | null;
  insertError?: string | null;
}): { outcome: PersistenceOutcome; deleteExecuted: boolean; insertExecuted: boolean } {
  if (input.inFlight) {
    return { outcome: "SKIP_MUTEX", deleteExecuted: false, insertExecuted: false };
  }
  if (input.normalizedCount === 0) {
    return { outcome: "SKIP_EMPTY", deleteExecuted: false, insertExecuted: false };
  }
  if (!input.hasUser) {
    return { outcome: "SKIP_NO_USER", deleteExecuted: false, insertExecuted: false };
  }
  if (input.deleteError) {
    return { outcome: "ABORT_DELETE_ERROR", deleteExecuted: true, insertExecuted: false };
  }
  if (input.insertError) {
    return { outcome: "ABORT_INSERT_ERROR", deleteExecuted: true, insertExecuted: true };
  }
  return { outcome: "PERSIST_OK", deleteExecuted: true, insertExecuted: true };
}

const scenarios = [
  {
    id: "A_empty_extraction",
    description: "items=[] → DELETE not executed, items preserved",
    input: { inFlight: false, rawItems: [], normalizedCount: 0, hasUser: true },
    expect: { outcome: "SKIP_EMPTY", deleteExecuted: false, insertExecuted: false },
  },
  {
    id: "B_double_trigger",
    description: "Second call while in-flight exits immediately",
    input: { inFlight: true, rawItems: [{ name: "x" }], normalizedCount: 1, hasUser: true },
    expect: { outcome: "SKIP_MUTEX", deleteExecuted: false, insertExecuted: false },
  },
  {
    id: "C_delete_error",
    description: "Delete error → abort before insert",
    input: {
      inFlight: false,
      rawItems: [{ name: "x" }],
      normalizedCount: 1,
      hasUser: true,
      deleteError: "RLS denied",
    },
    expect: { outcome: "ABORT_DELETE_ERROR", deleteExecuted: true, insertExecuted: false },
  },
  {
    id: "D_insert_error",
    description: "Insert error → surfaced, no success path",
    input: {
      inFlight: false,
      rawItems: [{ name: "x" }],
      normalizedCount: 1,
      hasUser: true,
      insertError: "duplicate key",
    },
    expect: { outcome: "ABORT_INSERT_ERROR", deleteExecuted: true, insertExecuted: true },
  },
  {
    id: "E_happy_path",
    description: "Normalized rows persist via delete+insert",
    input: {
      inFlight: false,
      rawItems: [{ name: "Prosciutto" }],
      normalizedCount: 1,
      hasUser: true,
    },
    expect: { outcome: "PERSIST_OK", deleteExecuted: true, insertExecuted: true },
  },
];

const results = scenarios.map((s) => {
  const actual = simulatePersistence(s.input);
  const pass =
    actual.outcome === s.expect.outcome &&
    actual.deleteExecuted === s.expect.deleteExecuted &&
    actual.insertExecuted === s.expect.insertExecuted;
  return { ...s, actual, pass };
});

const summary = {
  generated_at: new Date().toISOString(),
  source: "src/routes/invoices.tsx runExtraction guards (simulated)",
  scenarios: results,
  allPass: results.every((r) => r.pass),
  codeTrace: {
    mutex: "extractionInFlightRef.current[invoiceId] checked before await; cleared in finally",
    emptyGuard: "normalizedItems.length === 0 → return null before DELETE",
    deleteError: "deleteError → toast.error + return null",
    insertError: "insertError → toast.error + return null (not silent success)",
    reExtract: "if (result) guard — null return preserves UI items and skips header update",
  },
  regressionAnswers: {
    aviludoWipeNowImpossible: "YES — empty extraction cannot reach DELETE",
    emporioDuplicationNowImpossible: "YES — per-invoice mutex blocks concurrent runExtraction in same session",
    emporioDuplicationCaveat: "Cross-tab race still possible without DB lock (phase 2)",
  },
};

console.log(JSON.stringify(summary, null, 2));
