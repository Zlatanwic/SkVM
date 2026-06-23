---
name: tb-log-summary-date-ranges
description: Analyze date-stamped log files to count severity levels (ERROR, WARNING, INFO) across multiple date ranges (today, last 7 days, last 30 days, month-to-date, total) and output a structured CSV summary. Use this skill whenever the task involves parsing log files with names like YYYY-MM-DD_source.log, counting occurrences by severity and date range, generating a `/app/summary.csv` with specific period/severity/count columns, or working with a fixed reference date (2025-08-12) for time-window calculations. Also trigger when the user references log analysis, log summarization, severity counting, date-range aggregation, or any task that requires grouping log events by ERROR/WARNING/INFO across rolling and calendar-based time windows.
---

# tb-log-summary-date-ranges

Parse date-stamped log files, count ERROR/WARNING/INFO occurrences across
five date ranges, and produce a structured CSV at `/app/summary.csv`. This
is one of the Terminal-Bench 2.1 task skills; the full task lives at
`tasks/log-summary-date-ranges/` in the same repo as this skill.

## When this skill triggers

Use it when the user is dropped into the `log-summary-date-ranges` Docker
container and needs to deliver `/app/summary.csv` with exactly 15 data rows
(5 periods x 3 severities). Do **not** use it for general log parsing,
real-time log monitoring, or any task that does not require the specific
five date-range breakdown and the fixed reference date of 2025-08-12.

## Goal (one sentence)

Scan all `.log` files in `/app/logs`, count occurrences of ERROR, WARNING,
and INFO severities within today (2025-08-12), last 7 days, last 30 days,
month-to-date, and total ranges, then write a 16-line CSV (header + 15 data
rows) to `/app/summary.csv`.

## Required outputs

| File | Purpose |
|---|---|
| `/app/summary.csv` | CSV with header `period,severity,count` and 15 data rows covering all period-severity combinations |

Expected structure:
```
period,severity,count
today,ERROR,<count>
today,WARNING,<count>
today,INFO,<count>
last_7_days,ERROR,<count>
last_7_days,WARNING,<count>
last_7_days,INFO,<count>
last_30_days,ERROR,<count>
last_30_days,WARNING,<count>
last_30_days,INFO,<count>
month_to_date,ERROR,<count>
month_to_date,WARNING,<count>
month_to_date,INFO,<count>
total,ERROR,<count>
total,WARNING,<count>
total,INFO,<count>
```

## Recommended workflow

### 1. Survey the logs directory (≈ 3 min)

```bash
ls -la /app/logs/
head -5 /app/logs/*.log | head -50
```

Understand the log format:
- Filenames: `YYYY-MM-DD_<source>.log` (e.g., `2025-08-10_db.log`,
  `2025-08-12_app.log`).
- Each line likely contains a severity keyword (ERROR, WARNING, INFO).
- The severity may appear in different positions depending on the source.

Count files and approximate size:
```bash
ls /app/logs/ | wc -l
wc -l /app/logs/*.log | tail -1
```

### 2. Parse filenames to extract dates (≈ 5 min)

The reference date is fixed at **2025-08-12**. Compute the date ranges:

| Period | Date Range |
|---|---|
| `today` | 2025-08-12 only |
| `last_7_days` | 2025-08-06 through 2025-08-12 (inclusive) |
| `last_30_days` | 2025-07-14 through 2025-08-12 (inclusive) |
| `month_to_date` | 2025-08-01 through 2025-08-12 (inclusive) |
| `total` | All log files, regardless of date |

### 3. Write the analysis script (≈ 15 min)

```python
#!/usr/bin/env python3
"""Analyze log files and produce summary.csv."""
import csv
import os
from collections import defaultdict
from datetime import date, timedelta, datetime

LOGS_DIR = "/app/logs"
OUTPUT_PATH = "/app/summary.csv"
REFERENCE_DATE = date(2025, 8, 12)

SEVERITIES = ["ERROR", "WARNING", "INFO"]
PERIODS = ["today", "last_7_days", "last_30_days", "month_to_date", "total"]


def parse_filename(filename: str) -> date | None:
    """Extract date from 'YYYY-MM-DD_source.log'."""
    try:
        date_str = filename[:10]  # "YYYY-MM-DD"
        return datetime.strptime(date_str, "%Y-%m-%d").date()
    except (ValueError, IndexError):
        return None


def period_for_date(file_date: date) -> list[str]:
    """Return which periods this file's date belongs to."""
    periods = ["total"]  # total always includes everything
    if file_date == REFERENCE_DATE:
        periods.append("today")
    if REFERENCE_DATE - timedelta(days=6) <= file_date <= REFERENCE_DATE:
        periods.append("last_7_days")
    if REFERENCE_DATE - timedelta(days=29) <= file_date <= REFERENCE_DATE:
        periods.append("last_30_days")
    if file_date.year == REFERENCE_DATE.year and file_date.month == REFERENCE_DATE.month:
        periods.append("month_to_date")
    return periods


def count_severities(filepath: str) -> dict[str, int]:
    """Count ERROR, WARNING, INFO occurrences in a file."""
    counts = defaultdict(int)
    with open(filepath, "r", encoding="utf-8", errors="replace") as f:
        for line in f:
            upper_line = line.upper()
            for sev in SEVERITIES:
                # Match the severity as a distinct token/word to avoid
                # matching substrings (e.g., "ERROR" inside "NOERROR").
                if sev in upper_line:
                    # Simple containment; may need word-boundary check
                    # depending on log format.
                    counts[sev] += 1
    return counts


def main():
    # period -> severity -> count
    results: dict[str, dict[str, int]] = {
        period: defaultdict(int) for period in PERIODS
    }

    for filename in os.listdir(LOGS_DIR):
        if not filename.endswith(".log"):
            continue

        filepath = os.path.join(LOGS_DIR, filename)
        file_date = parse_filename(filename)
        if file_date is None:
            continue

        periods = period_for_date(file_date)
        counts = count_severities(filepath)

        for period in periods:
            for sev in SEVERITIES:
                results[period][sev] += counts.get(sev, 0)

    # Write CSV
    with open(OUTPUT_PATH, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["period", "severity", "count"])
        for period in PERIODS:
            for sev in SEVERITIES:
                writer.writerow([period, sev, results[period][sev]])

    print(f"Wrote {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
```

Or use bash with `awk` for a lighter approach:
```bash
#!/bin/bash
REF="2025-08-12"
REF_EPOCH=$(date -d "$REF" +%s)

# Initialize counters
declare -A TODAY_ERR TODAY_WARN TODAY_INFO
declare -A L7_ERR L7_WARN L7_INFO
# ... etc.

for f in /app/logs/*.log; do
    fname=$(basename "$f")
    fdate="${fname:0:10}"
    fepoch=$(date -d "$fdate" +%s 2>/dev/null) || continue
    diff=$(( (REF_EPOCH - fepoch) / 86400 ))

    for sev in ERROR WARNING INFO; do
        cnt=$(grep -c "$sev" "$f" 2>/dev/null || echo 0)
        # Accumulate into appropriate period counters based on $diff
        # ...
    done
done

# Write /app/summary.csv
```

### 4. Verify the CSV output (≈ 5 min)

```bash
# Check row count (should be 16: 1 header + 15 data)
wc -l /app/summary.csv

# Check header
head -1 /app/summary.csv

# Check all periods present
cut -d',' -f1 /app/summary.csv | sort | uniq -c

# Check all severities present
cut -d',' -f2 /app/summary.csv | sort | uniq -c

# Verify counts are non-negative integers
awk -F',' 'NR>1 && $3 !~ /^[0-9]+$/ {print "Invalid count at line " NR ": " $0}' /app/summary.csv
```

### 5. Validate date-range logic (≈ 3 min)

Manually verify a few files to ensure the date logic is correct:
```bash
# Today should ONLY include 2025-08-12
ls /app/logs/ | grep "2025-08-12"

# Last 7 days: 2025-08-06 to 2025-08-12
ls /app/logs/ | grep -E "2025-08-(06|07|08|09|10|11|12)"

# Last 30 days: 2025-07-14 to 2025-08-12
# Month to date: 2025-08-01 to 2025-08-12
```

## Verifier checklist (must all pass)

- [ ] `/app/summary.csv` exists and is valid CSV.
- [ ] Header row is exactly `period,severity,count`.
- [ ] All five periods (`today`, `last_7_days`, `last_30_days`,
  `month_to_date`, `total`) appear in the `period` column.
- [ ] All three severities (`ERROR`, `WARNING`, `INFO`) appear for each
  period.
- [ ] Counts are non-negative integers matching ground truth for each
  period-severity combination.
- [ ] Date calculations use 2025-08-12 as the reference date and are
  inclusive of boundary dates.

## Common pitfalls

1. **Off-by-one in date ranges.** "Last 7 days (including today)" means
   2025-08-06 through 2025-08-12 (7 days inclusive). Using 2025-08-05 as
   the start gives 8 days. Similarly, "Last 30 days" is
   2025-07-14 through 2025-08-12 (30 days inclusive). Verify:
   `(REFERENCE_DATE - start_date).days + 1 == expected_days`.
2. **Month-to-date calculation uses wrong month or year.** The reference
   date is 2025-08-12, so month-to-date covers 2025-08-01 through
   2025-08-12. If your script uses `date.today()` instead of the fixed
   reference, the results will be wrong.
3. **Severity matching too loose.** Using `if "ERROR" in line` matches
   substrings like "NOERROR" or "ERROR_COUNT". Use word-boundary regex
   (`\bERROR\b`) or verify the log format to ensure accurate matching.
   The verifier expects exact severity keyword counts.
4. **CSV format errors.** Extra spaces after commas, missing header row,
   wrong column order, or BOM characters at the start of the file can all
   cause the verifier to fail. Use Python's `csv.writer` for correct
   formatting, and check with `cat -A /app/summary.csv` for hidden
   characters.
5. **Filename parsing failure on non-standard names.** The task guarantees
   `YYYY-MM-DD_source.log` format, but if your parser is too strict
   (e.g., requiring exactly one underscore), it may skip valid files.
   Extract the first 10 characters as the date string.

## Quick sanity test (run after generating the CSV)

```bash
# Row count
echo "Expected 16 lines (1 header + 15 data):"
wc -l /app/summary.csv

# Valid CSV check
python3 -c "
import csv
with open('/app/summary.csv') as f:
    reader = csv.DictReader(f)
    rows = list(reader)
    print(f'Data rows: {len(rows)}')
    periods = set(r['period'] for r in rows)
    print(f'Periods: {periods}')
    assert periods == {'today', 'last_7_days', 'last_30_days', 'month_to_date', 'total'}
    for r in rows:
        assert r['severity'] in ('ERROR', 'WARNING', 'INFO')
        assert int(r['count']) >= 0
    print('All checks passed')
"
```

## Reference pointers

- Python `datetime` module for date arithmetic:
  https://docs.python.org/3/library/datetime.html
- The reference date is hard-coded as 2025-08-12 — do not use the system
  clock or `date.today()`.
- Word-boundary regex for severity matching:
  `re.search(r'\bERROR\b', line)` ensures you match the severity keyword
  and not a substring.
- Inside the task container, the verifier at the task root is the ground
  truth for what is scored.
