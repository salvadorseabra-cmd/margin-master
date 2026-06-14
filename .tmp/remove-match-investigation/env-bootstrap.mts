/** Vite-node bootstrap for canonical matcher imports in investigation harness. */
(import.meta as { env: { DEV: boolean; PROD: boolean } }).env = { DEV: false, PROD: true };
