/** Must load before ingredient-canonical (import.meta.env.DEV). */
(import.meta as { env: { DEV: boolean; PROD: boolean } }).env = { DEV: false, PROD: true };
