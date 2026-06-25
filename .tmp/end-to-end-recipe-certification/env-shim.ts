if (!(import.meta as { env?: Record<string, unknown> }).env) {
  Object.defineProperty(import.meta, "env", {
    value: { DEV: false, PROD: true, MODE: "production" },
    writable: true,
    configurable: true,
  });
}
