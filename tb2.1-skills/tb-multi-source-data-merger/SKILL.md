---
name: tb-multi-source-data-merger
description: Merge user data from three heterogeneous sources (JSON, CSV, Parquet) with different schemas, apply field name mappings to unify columns, resolve conflicts by priority (source_a > source_b > source_c), and produce a merged_users.parquet file plus a conflicts.json conflict report. Use this skill whenever the task mentions merging multi-format data, JSON/CSV/Parquet integration, field mapping (user_id/id/userId, email/email_address, full_name/name/userName), priority-based conflict resolution, ETL pipeline, or generating merged_users.parquet and conflicts.json. Also trigger for the alexgshaw/multi-source-data-merger:20251031 Docker image or references to merging heterogeneous data sources with schema mapping.
---

# tb-multi-source-data-merger

Build an ETL pipeline that reads user data from JSON, CSV, and Parquet
sources, normalizes their schemas through field-name mapping, deduplicates
by `user_id` with source-priority conflict resolution, writes a unified
`merged_users.parquet`, and produces a `conflicts.json` report of every
field-level disagreement. This is a Terminal-Bench 2.1 medium data-processing
task; the full task lives at `tasks/multi-source-data-merger/`.

## When this skill triggers

Use it when the user is dropped into the `multi-source-data-merger` container
and needs to produce `/app/merged_users.parquet` and `/app/conflicts.json`. Do
**not** use it for general data cleaning, single-source ETL, or merges that
don't involve the specific three sources and field-mapping rules described
below.

## Goal (one sentence)

Combine three heterogeneous user datasets (JSON, CSV, Parquet) into one
deduplicated, schema-unified Parquet file, resolving field conflicts by
the priority order source_a > source_b > source_c.

## Required outputs

| File | Purpose |
|---|---|
| `/app/merged_users.parquet` | Merged dataset with one row per unique `user_id`, containing columns: `user_id` (int), `name` (str), `email` (str), `created_date` (str, YYYY-MM-DD), `status` (str, optional). |
| `/app/conflicts.json` | Conflict report listing every field disagreement across sources, with values per source and the selected value. |

## Recommended workflow

### 1. Survey the input sources (≈ 3 min)

Read and inspect each source:

```bash
# source_a: highest priority
head /data/source_a/users.json
python3 -c "import pandas as pd; print(pd.read_json('/data/source_a/users.json').head())"

# source_b: medium priority
head /data/source_b/users.csv
python3 -c "import pandas as pd; print(pd.read_csv('/data/source_b/users.csv').head())"

# source_c: lowest priority
python3 -c "import pandas as pd; print(pd.read_parquet('/data/source_c/users.parquet').head())"
```

Note the column names in each source — they follow different conventions.

### 2. Map fields to unified schema (≈ 5 min)

Create a mapping from each source's column names to the unified names:

| Unified name | source_a | source_b | source_c |
|---|---|---|---|
| `user_id` | `user_id` | `id` | `userId` |
| `email` | `email` | `email_address` | `email` |
| `name` | `full_name` | `name` | `userName` |
| `created_date` | `registration_date` | `created_at` | `joined` |
| `status` | `status` | — | — |

Implementation:
```python
import pandas as pd

COLUMN_MAP = {
    "source_a": {
        "user_id": "user_id",
        "email": "email",
        "name": "full_name",
        "created_date": "registration_date",
        "status": "status",
    },
    "source_b": {
        "user_id": "id",
        "email": "email_address",
        "name": "name",
        "created_date": "created_at",
        # status not present in source_b
    },
    "source_c": {
        "user_id": "userId",
        "email": "email",
        "name": "userName",
        "created_date": "joined",
        # status not present in source_c
    },
}
```

### 3. Load and normalize each source (≈ 10 min)

```python
# Load
df_a = pd.read_json("/data/source_a/users.json")
df_b = pd.read_csv("/data/source_b/users.csv")
df_c = pd.read_parquet("/data/source_c/users.parquet")

# Normalize column names
def normalize(df, source_name):
    """Rename columns to unified schema."""
    mapping = {v: k for k, v in COLUMN_MAP[source_name].items()}
    return df.rename(columns=mapping)

df_a = normalize(df_a, "source_a")
df_b = normalize(df_b, "source_b")
df_c = normalize(df_c, "source_c")

# Ensure user_id is integer
for df in [df_a, df_b, df_c]:
    df["user_id"] = df["user_id"].astype(int)
```

### 4. Merge with priority resolution (≈ 15 min)

```python
# Combine all user_ids
all_ids = set(df_a["user_id"]) | set(df_b["user_id"]) | set(df_c["user_id"])

def get_source(uid, df, source_label):
    """Get row for a user_id from a dataframe, with source label."""
    match = df[df["user_id"] == uid]
    if match.empty:
        return None
    return match.iloc[0].to_dict(), source_label

merged = []
conflicts = []

for uid in sorted(all_ids):
    entry = {"user_id": int(uid)}
    sources = {}

    row_a = get_source(uid, df_a, "source_a")
    row_b = get_source(uid, df_b, "source_b")
    row_c = get_source(uid, df_c, "source_c")

    # Build per-field conflict tracker
    for field in ["name", "email", "created_date", "status"]:
        # Collect values from each source (in priority order)
        candidates = []
        for row, label in [(row_a, "source_a"), (row_b, "source_b"), (row_c, "source_c")]:
            if row is not None and field in row[0] and pd.notna(row[0][field]):
                candidates.append((label, row[0][field]))

        if not candidates:
            entry[field] = None
            continue

        # Priority: source_a > source_b > source_c
        priority_order = ["source_a", "source_b", "source_c"]
        selected = None
        for src in priority_order:
            for label, val in candidates:
                if label == src:
                    selected = val
                    break
            if selected is not None:
                break

        entry[field] = selected

        # Check for conflicts: different values from different sources
        unique_vals = set(v for _, v in candidates)
        if len(unique_vals) > 1:
            conflict = {
                "user_id": int(uid),
                "field": field,
                "values": {},
                "selected": selected,
            }
            for label, val in candidates:
                conflict["values"][label] = val
            conflicts.append(conflict)

    merged.append(entry)

merged_df = pd.DataFrame(merged)

# Ensure correct column order and types
merged_df = merged_df[["user_id", "name", "email", "created_date", "status"]]
merged_df["user_id"] = merged_df["user_id"].astype(int)
```

### 5. Format dates and write outputs (≈ 5 min)

```python
# Ensure created_date is in YYYY-MM-DD format
def format_date(val):
    """Normalize date to YYYY-MM-DD string."""
    if val is None or pd.isna(val):
        return None
    if isinstance(val, str):
        # Parse and reformat
        return pd.Timestamp(val).strftime("%Y-%m-%d")
    return val.strftime("%Y-%m-%d")

merged_df["created_date"] = merged_df["created_date"].apply(
    lambda x: format_date(x) if x is not None else None
)

# Write Parquet
merged_df.to_parquet("/app/merged_users.parquet", index=False)

# Write conflicts report
import json
conflict_report = {
    "total_conflicts": len(conflicts),
    "conflicts": conflicts,
}
with open("/app/conflicts.json", "w") as f:
    json.dump(conflict_report, f, indent=2, default=str)
```

### 6. Verify outputs (≈ 3 min)

```bash
# Check merged data
python3 -c "
import pandas as pd
df = pd.read_parquet('/app/merged_users.parquet')
print(df.head(10))
print(f'Total users: {len(df)}')
print(df.dtypes)
"

# Check conflicts
python3 -c "
import json
with open('/app/conflicts.json') as f:
    report = json.load(f)
print(f'Total conflicts: {report[\"total_conflicts\"]}')
for c in report['conflicts'][:5]:
    print(c)
"
```

## Verifier checklist (must all pass)

- [ ] `/app/merged_users.parquet` exists and is a valid Parquet file.
- [ ] All unique users from all three sources are included.
- [ ] Columns are: `user_id` (int), `name` (str), `email` (str),
      `created_date` (str, YYYY-MM-DD), `status` (str, optional).
- [ ] Field mappings are correctly applied (e.g., `id` → `user_id`).
- [ ] Conflicts are resolved by priority (source_a > source_b > source_c).
- [ ] `/app/conflicts.json` exists with correct structure.
- [ ] `total_conflicts` matches the number of entries in `conflicts` array.
- [ ] Each conflict entry has `user_id`, `field`, `values` (per-source
      dict), and `selected`.
- [ ] Date format is `YYYY-MM-DD` consistently.

## Common pitfalls

1. **Wrong conflict counting.** A conflict occurs when a user appears in
   multiple sources with DIFFERENT values for the SAME field. If the value
   is identical across all sources that have it, it is NOT a conflict.
   Also, if only one source has the field, there is nothing to conflict
   with. Count conflicts per-field per-user.
2. **Incorrect priority resolution.** The spec says source_a > source_b >
   source_c. If source_a has a value, use it even if source_b has a
   "better" value. Priority is absolute, not based on data quality.
3. **Missing optional fields.** `status` is optional and only present in
   source_a. If a user exists only in source_b and source_c, `status` will
   be `null`/`None`. Handle missing optional fields gracefully — don't
   error out.
4. **Date format inconsistency.** Sources may encode dates differently
   (ISO 8601, Unix timestamps, US format). Always parse and reformat to
   `YYYY-MM-DD`. The verifier checks the format string exactly.
5. **user_id type mismatch.** The spec requires `user_id` as integer.
   If any source has it as string, convert with `astype(int)`. Check for
   `NaN` values in the ID column before conversion — a NaN user_id is
   invalid and should be handled.

## Reference pointers

- Input files: `/data/source_a/users.json`, `/data/source_b/users.csv`,
  `/data/source_c/users.parquet`.
- Output files: `/app/merged_users.parquet`, `/app/conflicts.json`.
- pandas IO: `pd.read_json()`, `pd.read_csv()`, `pd.read_parquet()`,
  `df.to_parquet()`.
- Python `json` module for writing `conflicts.json`.
- Verify with: `pd.read_parquet('/app/merged_users.parquet')` and
  `json.load(open('/app/conflicts.json'))`.
- The priority rule is absolute: source_a always wins when present.
