# Drizzle Migrations Guide

## Two Ways to Sync Schema to Database

### Way 1: `db:push` (Dev only)

Reads your `schema.ts`, connects to the live DB, diffs them, applies changes directly.

- No migration files generated
- No history or audit trail
- May prompt interactively for ambiguous changes (rename vs drop+create)
- Cannot be automated in CI/CD (no one to answer prompts)

```bash
npm run db:push
```

### Way 2: `db:generate` + `db:migrate` (Dev + Staging + Production)

Two-step process. Generate SQL files locally, review them, then apply.

```bash
npm run db:generate   # creates SQL file from schema diff
npm run db:migrate    # runs unapplied SQL files against the DB
```

---

## How Migrations Work — Step by Step

### Step 1: You write your schema

```ts
// src/db/schema.ts
export const trips = pgTable('trips', {
  id: uuid('id').defaultRandom().primaryKey(),
  destination: text('destination'),
  departureDate: date('departure_date'),
});
```

### Step 2: Generate the first migration

```bash
npm run db:generate
```

Drizzle creates:
```
drizzle/
  0000_initial_schema.sql       ← CREATE TABLE SQL
  meta/_journal.json            ← tracks migration entries
  meta/0000_snapshot.json       ← snapshot of schema at this point
```

### Step 3: Apply the migration

```bash
npm run db:migrate
```

Drizzle:
1. Creates a `__drizzle_migrations` table in your DB (first time only)
2. Runs `0000_initial_schema.sql`
3. Records it as applied in `__drizzle_migrations`

### Step 4: Later, you change the schema

```ts
// renamed departure_date → start_date
startDate: date('start_date'),
```

```bash
npm run db:generate
```

Drizzle diffs `schema.ts` against the last snapshot and generates:
```
drizzle/
  0001_rename_start_date.sql    ← ALTER TABLE "trips" RENAME COLUMN ...
```

**You review this SQL file before running it.** This is the key advantage.

```bash
npm run db:migrate
```

Drizzle checks `__drizzle_migrations`, sees `0000` is already applied, runs only `0001`.

### Step 5: Your teammate pulls from git

They get the `drizzle/` folder with both SQL files. They run:

```bash
npm run db:migrate
```

Both migrations run in order. Their DB is now identical to yours.

---

## Real Example: What We Tested

### Setup

Schema had `departure_date` column on the `trips` table. We inserted:

| destination | departure_date |
|---|---|
| Tokyo | 2026-05-10 |

### The Change

Renamed in `schema.ts`:
```ts
// before
departureDate: date('departure_date'),

// after
startDate: date('start_date'),
```

### With `db:push`

Drizzle prompted interactively:

```
Is start_date column in trips table created or renamed from another column?
❯ + start_date                    create column
  ~ departure_date › start_date   rename column
```

- **Create column** → new empty column, `departure_date` dropped, data lost
- **Rename column** → data preserved in renamed column

This works in a terminal, but in CI/CD there is no one to answer the prompt.

### With `db:generate` + `db:migrate`

Drizzle generates a SQL file you can review:

```sql
ALTER TABLE "trips" RENAME COLUMN "departure_date" TO "start_date";
```

You verify it says RENAME (not DROP + ADD), commit it, and it runs the same way everywhere — local, staging, production. No prompts, no surprises.

---

## When to Use What

| Command | What it does | When to use |
|---|---|---|
| `db:push` | Diffs schema.ts vs live DB, applies directly | Quick local dev |
| `db:generate` | Diffs schema.ts vs last snapshot, creates SQL file | Before deploying changes |
| `db:migrate` | Runs unapplied SQL files against the DB | Deploy / CI / production |
| `db:studio` | Opens visual DB browser | Inspecting data |

## Rules

1. **Don't mix `db:push` and `db:migrate`** — pick one approach per environment
2. **Always review generated SQL** before running `db:migrate`
3. **Commit the `drizzle/` folder** to git — your teammates need it
4. **One sentence summary**: Migrations are version control for your database schema
