# Supabase CLI (this repo)

**Project ref** (same host as `VITE_SUPABASE_URL` in `.env.local`, which overrides `.env` for Vite): `lhackrnlnrsiamorzmkb`.

`supabase/config.toml` `project_id` must match that ref.

## If the CLI says it cannot find the project ref

1. Ensure `supabase/.temp/project-ref` exists and contains a single line: the ref above.
2. Or run link (needs DB password):

```bash
cd "$(git rev-parse --show-toplevel)"
npx supabase login
export SUPABASE_DB_PASSWORD='your-database-password'
npx supabase link --project-ref lhackrnlnrsiamorzmkb --password "$SUPABASE_DB_PASSWORD"
```

## Apply migrations to the linked remote

```bash
npx supabase db push
```

If you see **Forbidden** or auth errors: run `npx supabase login`, set `SUPABASE_DB_PASSWORD`, run `link` again, then `db push`.

If **IPv6 / DNS** errors when connecting to `db.<ref>.supabase.co`: upgrade the Supabase CLI; `link` may write pooler metadata so the CLI uses IPv4-friendly endpoints.
