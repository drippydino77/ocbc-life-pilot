# Supabase setup (for teammates)

The whole database schema lives in [`schema.sql`](schema.sql) — one idempotent file.

## First-time setup on a fresh Supabase project
1. Create a project at https://supabase.com.
2. **Enable email auth:** Authentication → Providers → Email (on).
3. **Create the schema:** SQL Editor → New query → paste all of `schema.sql` → Run.
   It's safe to re-run (every statement is `if not exists` / `drop policy if exists`).
4. **Point the app at your project:** in `frontend/js/config.js`, set `SUPABASE_URL`
   and `SUPABASE_ANON_KEY` to your project's values (Settings → API).

That's it — the app creates a `profiles` row on first login and writes goals,
expenses, feed events, chat history, and learned preferences as you use it.

## Tables (all Row-Level-Security scoped to the logged-in user)
| Table         | Purpose                                            |
|---------------|----------------------------------------------------|
| `profiles`    | One row per user — name, age, income, life stage   |
| `goals`       | Multiple savings goals per user                    |
| `expenses`    | Transactions (manual, OCR, or Lumi-recorded)       |
| `feed_events` | The AI activity / alert feed                       |
| `messages`    | Lumi chat history (cross-device continuity)        |
| `preferences` | What Lumi has learned about the user               |

## Changing the schema
Edit `schema.sql` and keep it idempotent (use `create table if not exists`,
`alter table ... add column if not exists`, `drop policy if exists` before
`create policy`). Commit it — re-running the file is how teammates pick up changes.
