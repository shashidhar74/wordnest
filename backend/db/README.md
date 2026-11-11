# Database

## `schema.sql`: the full structure

The complete database **structure** (tables, keys, indexes, checks; **no data**), exported with
`pg_dump --schema-only`. It is the source of truth for rebuilding the database, e.g. a new laptop,
a new Neon project, or after data loss.

Build an empty database from it:

```powershell
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -h <host> -p <port> -U <user> -d <new_empty_db> -f backend/db/schema.sql
```

Tested 2026-11-11: a database rebuilt from this file is identical to the local one
(columns, all 12 constraints, indexes).

## Changing a table: the rule

1. Write the change as SQL in `changes/`, named by date, e.g. `changes/2026-11-20-drop-posts-author.sql`.
2. Run it on **both** databases: local, then Neon (the live site).
3. Regenerate `schema.sql`:
   ```powershell
   & "C:\Program Files\PostgreSQL\17\bin\pg_dump.exe" -h localhost -p 5433 -U <user> -d <dbname> --schema-only --no-owner --no-acl -f backend/db/schema.sql
   ```
4. Commit the change file and `schema.sql` together.

If you forget step 2 for Neon, the live site fails with errors like *column "…" does not exist*.

## `migrations/001_create_comments.sql`

Written when the `comments` table was added. `schema.sql` now includes `comments`, so this file is
kept only as history.

## Later

When tables change often (or a second person joins), switch to a migration tool such as
`node-pg-migrate`, which runs numbered files in order and remembers which ones each database has.
