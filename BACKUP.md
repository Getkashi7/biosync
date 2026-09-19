# BIOSYNC — backup and restore

The thing to understand first: **Supabase's free tier has no backups.** Point-in-time recovery is
a paid feature. Until the project is on a paid plan, the nightly dump described here is the only
copy of the database that exists, and a dropped table or a deleted project takes every check-in,
metric, meal, photo row and treatment decision with it.

The second thing: **a backup you have never restored is not a backup.** Do the drill in
[Restore drill](#restore-drill) once before launch, and once after any change to the schema
tooling. Twenty minutes now against discovering at the worst possible moment that the dump is
missing a table.

---

## How it runs

`.github/workflows/db-backup.yml` — nightly at 03:17 UTC, plus **Actions → Database backup → Run
workflow** whenever you want one.

Each run:

1. `pg_dump --format=custom` against the **session** connection (port 5432).
2. Verifies the dump: size floor, then reads its table of contents and fails unless every named
   table has a data section. A dump that succeeded and produced an empty schema is the failure
   this catches — it looks green and restores an empty app.
3. Encrypts with `gpg --symmetric` (AES-256) and shreds the plaintext.
4. Uploads as an artifact, kept **90 days**.

### Why encrypted

The dump holds health data. A GitHub artifact is downloadable by anyone with repository access —
a wider audience than any user consented to. Encrypting before the file is ever stored means the
artifact is useless to someone who can only download it.

### Why not the pooled URL

`pg_dump` needs a consistent snapshot across one session. Transaction-mode pooling (port 6543)
cannot hold one, and the dump fails part way. `BACKUP_DATABASE_URL` must be the **`DIRECT_URL`**
value — port **5432**. The workflow refuses to start if it sees `:6543`, because the alternative
is a half-written dump that passes and is useless.

---

## Setup

Two repository secrets (Settings → Secrets and variables → Actions):

| Secret | Value |
|---|---|
| `BACKUP_DATABASE_URL` | The session connection string, port **5432** — the same value as `DIRECT_URL` in `apps/api/.env` |
| `BACKUP_PASSPHRASE` | A long random passphrase |

> **Store `BACKUP_PASSPHRASE` somewhere other than GitHub too** — a password manager, written
> down, anywhere that survives losing access to the repository. Losing it makes every backup
> permanently unreadable, which is the same position as having no backups at all. Copying it out
> of the secrets UI later is not possible; GitHub will not show it to you again.

Generate one:

```bash
openssl rand -base64 48
```

---

## Restore

You need `gpg` and `pg_restore` (PostgreSQL 17 client). On Windows, use the CI runner or WSL —
this machine has neither, which is itself a reason the schedule lives in CI.

**1. Download and decrypt**

```bash
gh run download <run-id> -n biosync-db-<STAMP>
gpg --decrypt --output biosync.dump biosync-<STAMP>.dump.gpg
```

**2. Look before you restore**

```bash
pg_restore --list biosync.dump | grep 'TABLE DATA'
```

Confirm the tables and the row-bearing sections you expect are there. This is the step that turns
"we have a backup" into "we have this data".

**3a. Restore one table** — the common case (a bad migration, a mistaken delete)

```bash
pg_restore --data-only --table=daily_logs --no-owner --no-privileges \
  --dbname "$DIRECT_URL" biosync.dump
```

`--data-only` leaves the schema alone. If the live rows conflict, restore into a scratch database
first (3b) and copy across what you need — a blind `--clean` on a live table deletes the rows that
are still good.

**3b. Restore everything into a fresh database** — project loss, or the drill

```bash
createdb biosync_restore                       # or a new Supabase project's DIRECT_URL
pg_restore --no-owner --no-privileges --jobs=4 \
  --dbname "postgresql://…/biosync_restore" biosync.dump
```

**4. What the dump does NOT contain**

- **`auth.users`** — the dump is `--schema=public` only. Supabase owns `auth`, and it is not
  dumpable over a normal connection. `public.users` mirrors it by id, so after a full restore into
  a new project the rows are there but nobody can log in until the auth users exist again with the
  **same uuids**. Plan for that before it is an emergency: it is the difference between "restored"
  and "restored and usable".
- **Storage objects** — progress photos live in a Supabase bucket, not in Postgres. `Photo` rows
  restore; the images they point at do not. Backing up the bucket is a separate job and is not
  built (see `LATER.md`).
- **Secrets** — `.env`, Render environment, the Supabase keys. Keep those wherever you keep the
  passphrase.

---

## Restore drill

Do this once before launch. It is the only way to know any of the above is true.

1. Trigger a backup by hand (**Actions → Database backup → Run workflow**).
2. Download and decrypt it.
3. Restore into a scratch database (3b).
4. Run one real query against the restored copy and check the numbers look like the live app:

   ```sql
   select
     (select count(*) from users)       as users,
     (select count(*) from daily_logs)  as logs,
     (select max(created_at) from daily_logs) as newest_log;
   ```

5. Drop the scratch database.

Write the date you last did this here: **never** ← change this line when you do it.

---

## Before launch

- [ ] Both secrets set, passphrase stored outside GitHub
- [ ] One workflow run finished green
- [ ] Restore drill done, line above updated
- [ ] Decide on the paid Supabase tier. This scheme is a floor, not a replacement: it is nightly,
      so the worst case is losing a day of everybody's data, and it does not protect against the
      free tier pausing the project after 7 days idle (see `LATER.md` → Ops).
