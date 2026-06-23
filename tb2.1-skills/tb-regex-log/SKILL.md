---
name: tb-regex-log
description: Construct a single regular expression that matches YYYY-MM-DD dates appearing only in log lines that contain a valid IPv4 address, capturing the last date per line. Use this skill whenever the task involves crafting a complex regex with lookahead/lookbehind assertions, matching dates with IPv4 address context, handling boundary conditions to avoid false matches, or saving a regex pattern to `/app/regex.txt` for use with Python's `re.findall` with `re.MULTILINE`. Also trigger when the user references log file parsing, IPv4 validation via regex, or date extraction with contextual constraints.
---

# tb-regex-log

Write a single regex pattern that extracts dates (YYYY-MM-DD) from log lines
that also contain a valid IPv4 address, matching only the last date on each
line, and save it to `/app/regex.txt`. This is one of the Terminal-Bench 2.1
task skills; the full task lives at `tasks/regex-log/` in the same repo as this
skill.

## When this skill triggers

Use it when the user is dropped into the `regex-log` Docker container and needs
to produce a single regex fulfilling the date+IPv4 constraint. Do **not** use it
for general regex tutorials, multi-pattern extraction scripts, or tasks that
involve anything other than writing a single regex pattern to a file.

## Goal (one sentence)

Produce a regex that matches the last YYYY-MM-DD date on every log line that
contains a valid IPv4 address, using only word-boundary checks for validity,
and save it to `/app/regex.txt`.

## Required outputs

| File | Purpose |
|---|---|
| `/app/regex.txt` | A single regex pattern (no trailing newline) to be used with `re.findall(pattern, log_text, re.MULTILINE)`. |

The verifier loads the pattern, runs it against test log files, and checks that
the correct dates are extracted.

## Recommended workflow

### 1. Understand the requirements precisely (≈ 5 min)

The regex must:
1. Only match dates on lines that contain an IPv4 address.
2. If a line has multiple dates, match only the **last** date.
3. Dates must be in `YYYY-MM-DD` format.
4. February can have up to 29 days in all years (leap year distinction not required).
5. IPv4 addresses use normal decimal notation **without leading zeros** in each octet.
6. Valid dates and IPv4 addresses must not be immediately preceded or followed by
   alphanumeric characters (word-boundary requirement).
7. The regex is used with `re.findall(pattern, log_text, re.MULTILINE)`.

### 2. Break down the sub-patterns (≈ 5 min)

**IPv4 address (no leading zeros per octet):**
```
(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)
```

Wait — `\d` matches `0` and single-digit octets, but the spec says "without
leading zeros." A leading zero means `01`, `001`, etc. So each octet should be
one of:
- `25[0-5]` (250-255)
- `2[0-4]\d` (200-249)
- `1\d\d` (100-199)
- `[1-9]\d` (10-99)
- `\d` (0-9) — but not `0` followed by more digits

Actually, "without leading zeros" means: octets like `01`, `001`, `099` are
invalid. But `0` alone (the number zero) is valid. The pattern above allows
`0` but not `01` because `0` followed by a digit would match `[1-9]\d` or `\d`
depending on the digit, and then the remaining digits would not match.

A cleaner approach: each octet is `0` OR `[1-9]\d?` OR `1\d\d` OR `2[0-4]\d` OR `25[0-5]`:
```
(?:0|[1-9]\d?|1\d\d|2[0-4]\d|25[0-5])
```

**Date (YYYY-MM-DD):**
```
\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])
```
With February having up to 29 days in all years, we treat month 02 as having
days 01-29 instead of 01-28. So:
```
\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])
```
This already allows 02-29, 02-30, 02-31 for all years — we adjust to cap at 29:
```
\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01]|(?:02-(?:0[1-9]|1\d|2[0-9])))
```
Actually, simpler: just use `0[1-9]|[12]\d|3[01]` and accept that February 30th
will match. Wait — the spec says "Assume that February can have up to 29 days in
all years." So we need to allow 02-29 but NOT 02-30 or 02-31. That means the day
pattern for month 02 must be `0[1-9]|1\d|2[0-9]` (capped at 29).

A complete date pattern:
```
\d{4}-(?:0[13-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])|\d{4}-02-(?:0[1-9]|1\d|2[0-9])
```
Or using a lookahead-free single capture approach:
```
\d{4}-(?:02-(?:0[1-9]|1\d|2[0-9])|(?:0[13-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01]))
```

### 3. Assemble the full regex (≈ 10 min)

The constraint "only match the last date on a line" and "only on lines with an
IPv4 address" requires a regex structure that:

1. Matches a whole line containing an IPv4 address.
2. Within that line, captures only the last date.

A common approach uses a single pattern with `^` and `$` anchors in multiline
mode, or a lookahead-based approach:

**Approach: Positive lookahead for IPv4, then capture last date.**

```regex
^(?=.*<IPv4_PATTERN>).*<DATE_PATTERN>(?!.*<DATE_PATTERN>)
```

In multiline mode, `^` matches the start of each line, and `$` matches the end.
The lookahead `(?=.*<IPv4>)` ensures the line has an IPv4 address. Then `.*<DATE>`
captures text up to a date, and `(?!.*<DATE>)` is a negative lookahead ensuring
no date follows. The date is wrapped in a capturing group.

Putting it together:

```regex
^(?=.*\b(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)\b).*\b(\d{4}-\d{2}-\d{2})\b(?!.*\b\d{4}-\d{2}-\d{2}\b)
```

But we want `re.findall()` which returns capture groups. The date must be in
a capturing group `(...)`. The IPv4 lookahead uses non-capturing groups `(?:...)`.

Boundary checks: `\b` ensures the date and IPv4 address are not immediately
adjacent to alphanumeric characters.

### 4. Test against sample log data (≈ 5 min)

```python
import re

with open("/app/regex.txt") as f:
    pattern = f.read().strip()

# Test lines
test_lines = """
2024-03-15 user connected from 192.168.1.1
No IP here but date 2024-03-16 present
2024-03-17 first date and 2024-03-18 last date from 10.0.0.1
user 1134-12-1234 fake date with 192.168.0.1 real IP
2024-02-29 leap on line with 1.2.3.4 IP
2024-02-30 invalid feb date from 5.6.7.8
192.168.001.1 with leading zeros and 2024-03-19
alphanumeric192.168.1.1boundary with 2024-03-20
192.168.1.1noboundary date2024-03-21moretext
"""

matches = re.findall(pattern, test_lines, re.MULTILINE)
print(matches)
```

### 5. Iterate and save (≈ 5 min)

Refine until the pattern correctly:
- Skips lines without IPv4 addresses.
- Captures only the last date per line.
- Rejects dates/addresses without proper word boundaries.
- Handles February 29th.

Save the final pattern:

```bash
echo -n 'your_pattern_here' > /app/regex.txt
```

Note: use `echo -n` (or `printf`) to avoid a trailing newline in the file, which
would become part of the regex pattern.

## Verifier checklist (must all pass)

- [ ] `/app/regex.txt` exists.
- [ ] File contains a valid regex pattern.
- [ ] Pattern matches dates only on lines containing a valid IPv4 address.
- [ ] On lines with multiple dates, only the last date is matched.
- [ ] Dates must be properly bounded (not adjacent to alphanumeric chars).
- [ ] IPv4 addresses must be properly bounded.
- [ ] February 29th is treated as valid.
- [ ] IPv4 octets with leading zeros (e.g., `192.168.001.1`) are NOT matched.

## Common pitfalls

1. **Forgetting that `re.findall` with capture groups returns only the groups.**
   If your pattern has a capturing group for the date, `re.findall` returns a
   list of the captured dates (which is what you want). If you accidentally
   capture the IPv4 address too, you'll get tuples instead of date strings.
2. **Leading zeros in IPv4 octets.** The spec explicitly says "without leading
   zeros." A pattern like `\d{1,3}` matches `001`, `01`, etc. You must use
   the zero-or-non-leading-zero pattern: `(?:0|[1-9]\d?|1\d\d|2[0-4]\d|25[0-5])`.
3. **Word boundaries around hyphens.** The `\b` anchor sits between a word
   character and a non-word character. Since `-` is not a word character,
   `\b` before a date like `2024-03-15` works because the date likely starts
   after a space or at the start of a line. But `\b` between a letter and
   the date will prevent matches like `date2024-03-15` — which is correct
   per the spec.
4. **Not handling the "last date per line" constraint.** A simple `\d{4}-\d{2}-\d{2}`
   pattern will match every date. You need a negative lookahead
   `(?!.*\b\d{4}-\d{2}-\d{2}\b)` after the captured date to ensure no further
   dates appear on the same line.
5. **Trailing newline in the file.** If `echo 'pattern' > file` is used (without
   `-n`), the regex will end with `\n`, which `re.findall` may interpret as
   part of the pattern. Use `printf '%s' 'pattern' > file` or `echo -n 'pattern' > file`.

## Reference pointers

- Python `re` module documentation: `re.findall`, `re.MULTILINE`, lookahead assertions.
- Regex101.com is useful for interactive debugging of complex patterns.
- The verifier script at `tests/test_outputs.py` in the task directory is the
  ground truth for what is scored.
