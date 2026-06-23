---
name: tb-query-optimize
description: Optimize a slow SQL query on the Open English Wordnet (OEWN) SQLite database by rewriting correlated subqueries using CTEs and window functions while preserving exact output. Use this skill whenever the task involves SQL query optimization on SQLite, replacing correlated subqueries with JOINs or window functions, using `EXPLAIN QUERY PLAN`, rewriting queries with CTEs (`WITH` clauses), or producing an optimized `sol.sql` that produces identical results. Also trigger when the user references `/app/oewn.sqlite`, `/app/my-sql-query.sql`, or `/app/sol.sql`.
---

# tb-query-optimize

Rewrite the slow SQL query in `/app/my-sql-query.sql` to produce the same output
faster, using only SQLite-compatible syntax, and save the result as a single
statement in `/app/sol.sql`. This is one of the Terminal-Bench 2.1 task skills;
the full task lives at `tasks/query-optimize/` in the same repo as this skill.

## When this skill triggers

Use it when the user is dropped into the `query-optimize` Docker container and
needs to optimize a SQLite query. Do **not** use it for general SQL tuning on
other databases (PostgreSQL, MySQL), queries that need to be translated across
dialects, or tasks where the original query is not provided at
`/app/my-sql-query.sql`.

## Goal (one sentence)

Rewrite the given SQL query so it executes faster on the OEWN SQLite database
while returning exactly the same rows and columns, saving the optimized query
to `/app/sol.sql`.

## Required outputs

| File | Purpose |
|---|---|
| `/app/sol.sql` | Optimized SQL query — one single statement, SQLite syntax, terminated by `;`, no comments. |

The verifier runs both queries, compares output (must be identical), and checks
that the optimized version uses fewer resources or executes faster.

## Recommended workflow

### 1. Understand the original query (≈ 5 min)

```bash
cat /app/my-sql-query.sql
sqlite3 /app/oewn.sqlite ".read /app/my-sql-query.sql"
```

Look for common performance killers in the query:
- **Correlated subqueries** in `SELECT` or `WHERE` clauses — these re-execute
  for every row of the outer query.
- **`NOT IN (SELECT ...)`** with large subquery results — creates a full scan
  and anti-join.
- **Multiple nested subqueries** referencing outer columns.
- **Missing `JOIN` conditions** that could use indexes.

### 2. Inspect the database schema (≈ 2 min)

```bash
sqlite3 /app/oewn.sqlite ".schema"
sqlite3 /app/oewn.sqlite ".indexes"
```

Key OEWN tables typically include: `words`, `synsets`, `senses`, `lexical relations`,
`semantic relations`. Note primary keys and foreign key relationships — these
dictate which JOINs are efficient.

### 3. Profile the original query (≈ 2 min)

```bash
sqlite3 /app/oewn.sqlite "EXPLAIN QUERY PLAN <original query>"
```

Look for `SCAN TABLE` lines (table scans are slow) and `CORRELATED SCALAR SUBQUERY`
lines (the main optimization target). The goal is to replace scans with searches
(`SEARCH TABLE` using an index).

### 4. Rewrite the query (≈ 15 min)

Common optimization strategies for SQLite:

**Replace correlated subqueries with JOINs:**
```sql
-- Before (correlated):
SELECT w.lemma,
       (SELECT COUNT(*) FROM senses s WHERE s.wordid = w.wordid) AS sense_count
FROM words w;

-- After (LEFT JOIN + GROUP BY):
SELECT w.lemma, COUNT(s.senseid) AS sense_count
FROM words w
LEFT JOIN senses s ON s.wordid = w.wordid
GROUP BY w.wordid, w.lemma;
```

**Replace `NOT IN` with `NOT EXISTS` or anti-join:**
```sql
-- Before:
SELECT * FROM words WHERE wordid NOT IN (SELECT wordid FROM exclude_list);

-- After:
SELECT w.* FROM words w
LEFT JOIN exclude_list e ON w.wordid = e.wordid
WHERE e.wordid IS NULL;
```

**Use CTEs for readability and to avoid repeated computation:**
```sql
WITH base AS (
    SELECT ... FROM ...
    WHERE ...
)
SELECT ... FROM base JOIN ... ON ...;
```

**Use window functions instead of self-joins for ranking:**
```sql
SELECT lemma, ROW_NUMBER() OVER (PARTITION BY pos ORDER BY freq DESC) AS rank
FROM words;
```

### 5. Verify output equivalence (≈ 3 min)

```bash
# Run original and save output
sqlite3 /app/oewn.sqlite ".read /app/my-sql-query.sql" > /tmp/orig.txt

# Run optimized and save output
sqlite3 /app/oewn.sqlite ".read /app/sol.sql" > /tmp/opt.txt

# Compare
diff /tmp/orig.txt /tmp/opt.txt  # must produce no differences
```

### 6. Save the final query (≈ 1 min)

```bash
# Ensure sol.sql has exactly one query, no comments, terminated by semicolon
cat /app/sol.sql
```

## Verifier checklist (must all pass)

- [ ] `/app/sol.sql` exists and contains a single SQL query.
- [ ] The query uses SQLite-compatible syntax (no PostgreSQL/MySQL extensions).
- [ ] No comments in the file.
- [ ] Terminated by a semicolon.
- [ ] Output is byte-for-byte identical to the original query's output.
- [ ] The optimized query executes faster (or uses a better query plan).

## Common pitfalls

1. **Changing the output semantics.** Even a small change — different column
   ordering, different NULL handling, different rounding — will cause the
   diff to fail. Test output equivalence early and often.
2. **Using non-SQLite syntax.** Features like `LATERAL JOIN`, `FILTER (WHERE)`,
   or PostgreSQL-specific operators will fail on SQLite. Stick to standard
   SQL that SQLite supports. Check the SQLite documentation for supported
   features.
3. **Leaving comments in `sol.sql`.** The spec says "no comments." Even a
   `--` line or `/* */` block will cause the verifier to reject.
4. **Multiple statements.** The file must contain exactly one SQL statement.
   No `CREATE TABLE`, no `INSERT`, no extra semicolons before or after.
5. **Forgetting that SQLite does not optimize correlated subqueries well.**
   Unlike PostgreSQL or MySQL, SQLite does not decorrelate subqueries
   automatically. A correlated subquery that's fine on another engine may
   be catastrophic on SQLite. Always rewrite them as JOINs.

## Reference pointers

- SQLite query planner documentation:
  https://www.sqlite.org/queryplanner.html
- SQLite `EXPLAIN QUERY PLAN` output interpretation:
  https://www.sqlite.org/eqp.html
- Open English Wordnet schema: the OEWN GitHub repository documents the
  table structure.
- The verifier script at `tests/test_outputs.py` in the task directory is the
  ground truth for what is scored.
